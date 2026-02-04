// Module SEO - seoService.js (ESM)
import { supabase } from '../../config/supabase.js';
import Anthropic from '@anthropic-ai/sdk';
import { getTenantConfig } from '../../config/tenants/index.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ==================== AUDITS ====================

export async function createAudit(tenantId, url) {
  const { data, error } = await supabase
    .from('seo_audits')
    .insert({ tenant_id: tenantId, url, status: 'pending' })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getAudits(tenantId, filters = {}) {
  let query = supabase
    .from('seo_audits')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getAuditById(tenantId, auditId) {
  const { data, error } = await supabase
    .from('seo_audits')
    .select('*')
    .eq('id', auditId)
    .eq('tenant_id', tenantId)
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function runAudit(auditId) {
  // Mark as running
  await supabase.from('seo_audits').update({ status: 'running' }).eq('id', auditId);

  // Get audit info
  const { data: audit, error } = await supabase
    .from('seo_audits')
    .select('*')
    .eq('id', auditId)
    .single();
  if (error) return { success: false, error: error.message };

  // Real audit: fetch page HTML and analyze SEO elements
  const results = await analyzePageSEO(audit.url);
  const recommendations = generateRecommendations(results);
  const score = calculateScore(results);

  const issuesCritical = results.issues.filter(i => i.severity === 'critical').length;
  const issuesWarning = results.issues.filter(i => i.severity === 'warning').length;
  const issuesInfo = results.issues.filter(i => i.severity === 'info').length;

  const { data: updated, error: updateError } = await supabase
    .from('seo_audits')
    .update({
      status: 'completed',
      score,
      results,
      recommendations,
      crawled_pages: results.crawledPages || 1,
      issues_critical: issuesCritical,
      issues_warning: issuesWarning,
      issues_info: issuesInfo,
      completed_at: new Date().toISOString(),
    })
    .eq('id', auditId)
    .select()
    .single();

  if (updateError) return { success: false, error: updateError.message };

  // Generate recommendations records
  for (const rec of recommendations) {
    await supabase.from('seo_recommendations_applied').insert({
      tenant_id: audit.tenant_id,
      audit_id: auditId,
      type: rec.type,
      page_url: audit.url,
      recommendation: rec.text,
    });
  }

  return { success: true, data: updated };
}

export async function deleteAudit(tenantId, auditId) {
  const { error } = await supabase
    .from('seo_audits')
    .delete()
    .eq('id', auditId)
    .eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Audit supprimé' };
}

// ==================== KEYWORDS ====================

export async function getKeywords(tenantId, filters = {}) {
  let query = supabase
    .from('seo_keywords')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function addKeyword(tenantId, data) {
  const { keyword, target_url, search_volume } = data;
  if (!keyword) return { success: false, error: 'keyword requis' };

  const { data: created, error } = await supabase
    .from('seo_keywords')
    .insert({
      tenant_id: tenantId,
      keyword,
      target_url: target_url || null,
      search_volume: search_volume || null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: created };
}

export async function updateKeyword(tenantId, keywordId, data) {
  const updates = {};
  if (data.keyword !== undefined) updates.keyword = data.keyword;
  if (data.target_url !== undefined) updates.target_url = data.target_url;
  if (data.search_volume !== undefined) updates.search_volume = data.search_volume;
  if (data.status !== undefined) updates.status = data.status;

  const { data: updated, error } = await supabase
    .from('seo_keywords')
    .update(updates)
    .eq('id', keywordId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: updated };
}

export async function deleteKeyword(tenantId, keywordId) {
  const { error } = await supabase
    .from('seo_keywords')
    .delete()
    .eq('id', keywordId)
    .eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Keyword supprimé' };
}

export async function checkKeywordPosition(keywordId) {
  const { data: kw, error } = await supabase
    .from('seo_keywords')
    .select('*')
    .eq('id', keywordId)
    .single();
  if (error) return { success: false, error: error.message };

  // Real position check via SerpAPI (if configured)
  let position = null;
  let source = 'unavailable';

  if (process.env.SERPAPI_KEY) {
    try {
      const query = encodeURIComponent(kw.keyword);
      const resp = await fetch(
        `https://serpapi.com/search.json?q=${query}&location=France&hl=fr&gl=fr&api_key=${process.env.SERPAPI_KEY}`
      );
      const serpData = await resp.json();
      if (serpData.organic_results && kw.target_url) {
        const targetHost = new URL(kw.target_url).hostname;
        const idx = serpData.organic_results.findIndex(r =>
          r.link && r.link.includes(targetHost)
        );
        position = idx >= 0 ? idx + 1 : null;
        source = 'serpapi';
      }
    } catch (err) {
      console.error('[SEO] SerpAPI error:', err.message);
    }
  }

  // Record position history only if we have a real position
  if (position !== null) {
    await supabase.from('seo_positions').insert({
      keyword_id: keywordId,
      position,
      url: kw.target_url,
    });
  }

  // Update keyword
  const updates = {
    last_checked: new Date().toISOString(),
  };
  if (position !== null) {
    updates.previous_position = kw.current_position;
    updates.current_position = position;
    if (!kw.best_position || position < kw.best_position) {
      updates.best_position = position;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('seo_keywords')
    .update(updates)
    .eq('id', keywordId)
    .select()
    .single();
  if (updateError) return { success: false, error: updateError.message };

  return {
    success: true,
    data: updated,
    source,
    message: source === 'unavailable'
      ? 'SERPAPI_KEY non configurée - position non vérifiable. Configurez SerpAPI pour le suivi de positions.'
      : undefined,
  };
}

export async function getKeywordHistory(keywordId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('seo_positions')
    .select('*')
    .eq('keyword_id', keywordId)
    .gte('checked_at', since.toISOString())
    .order('checked_at', { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== COMPETITORS ====================

export async function getCompetitors(tenantId) {
  const { data, error } = await supabase
    .from('seo_competitors')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function addCompetitor(tenantId, data) {
  const { name, url } = data;
  if (!name || !url) return { success: false, error: 'name et url requis' };

  const { data: created, error } = await supabase
    .from('seo_competitors')
    .insert({ tenant_id: tenantId, name, url })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: created };
}

export async function deleteCompetitor(tenantId, competitorId) {
  const { error } = await supabase
    .from('seo_competitors')
    .delete()
    .eq('id', competitorId)
    .eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Concurrent supprimé' };
}

export async function compareWithCompetitor(tenantId, competitorId) {
  // Get our keywords
  const { data: ourKeywords } = await supabase
    .from('seo_keywords')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  // Get competitor keywords
  const { data: compKeywords } = await supabase
    .from('seo_competitor_keywords')
    .select('*')
    .eq('competitor_id', competitorId);

  // Get competitor info
  const { data: competitor } = await supabase
    .from('seo_competitors')
    .select('*')
    .eq('id', competitorId)
    .single();

  const comparison = (ourKeywords || []).map(kw => {
    const compKw = (compKeywords || []).find(ck => ck.keyword.toLowerCase() === kw.keyword.toLowerCase());
    return {
      keyword: kw.keyword,
      our_position: kw.current_position,
      competitor_position: compKw ? compKw.position : null,
      gap: compKw && kw.current_position ? kw.current_position - compKw.position : null,
    };
  });

  return {
    success: true,
    data: {
      competitor: competitor ? { id: competitor.id, name: competitor.name, url: competitor.url } : null,
      keywords_compared: comparison.length,
      comparison,
      summary: {
        we_win: comparison.filter(c => c.gap !== null && c.gap < 0).length,
        they_win: comparison.filter(c => c.gap !== null && c.gap > 0).length,
        tie: comparison.filter(c => c.gap === 0).length,
        no_data: comparison.filter(c => c.gap === null).length,
      },
    },
  };
}

// ==================== RECOMMENDATIONS ====================

export async function getRecommendations(tenantId, auditId) {
  let query = supabase
    .from('seo_recommendations_applied')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (auditId) query = query.eq('audit_id', auditId);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function generateMetaDescription(pageContent) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Génère une meta description SEO optimisée en français.\n\nContenu de la page:\n${(pageContent || '').substring(0, 1500)}\n\nRègles:\n- Entre 150 et 160 caractères exactement\n- Inclure un appel à l'action\n- Ton professionnel et engageant\n- En français\n\nRéponds UNIQUEMENT avec la meta description, rien d'autre.`,
      }],
    });
    const description = response.content[0].text.trim().substring(0, 160);
    return {
      success: true,
      data: {
        meta_description: description,
        length: description.length,
        optimal: description.length >= 120 && description.length <= 160,
        source: 'ai',
      },
    };
  } catch (err) {
    console.error('[SEO] AI meta description error:', err.message);
    const fallback = `Découvrez nos services professionnels. ${(pageContent || '').substring(0, 100)}... Contactez-nous.`;
    return {
      success: true,
      data: {
        meta_description: fallback.substring(0, 160),
        length: Math.min(fallback.length, 160),
        optimal: false,
        source: 'fallback',
      },
    };
  }
}

export async function generateTitle(pageContent, keyword) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Génère un titre SEO optimisé en français.\n\nContenu de la page:\n${(pageContent || '').substring(0, 1000)}\nMot-clé principal: ${keyword || 'non spécifié'}\n\nRègles:\n- Entre 50 et 60 caractères\n- Placer le mot-clé en début si possible\n- Inclure un séparateur | ou - pour le nom de marque\n- Accrocheur et descriptif\n\nRéponds UNIQUEMENT avec le titre, rien d'autre.`,
      }],
    });
    const title = response.content[0].text.trim().substring(0, 60);
    return {
      success: true,
      data: {
        title,
        length: title.length,
        optimal: title.length >= 50 && title.length <= 60,
        keyword_position: keyword ? (title.toLowerCase().indexOf(keyword.toLowerCase()) === 0 ? 'début' : title.toLowerCase().includes(keyword.toLowerCase()) ? 'présent' : 'absent') : 'absent',
        source: 'ai',
      },
    };
  } catch (err) {
    console.error('[SEO] AI title error:', err.message);
    const fallback = keyword ? `${keyword} - Service Professionnel` : `Service Professionnel | ${(pageContent || '').substring(0, 30)}`;
    return {
      success: true,
      data: {
        title: fallback.substring(0, 60),
        length: Math.min(fallback.length, 60),
        optimal: false,
        source: 'fallback',
      },
    };
  }
}

export async function generateAltTexts(images) {
  if (!images || images.length === 0) return { success: true, data: [] };

  try {
    const imageList = images.map((img, i) => `${i + 1}. ${img.src || img}${img.context ? ` (contexte: ${img.context})` : ''}`).join('\n');
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Génère des textes alt SEO optimisés pour ces images.\n\nImages:\n${imageList}\n\nRègles:\n- Entre 50 et 125 caractères par alt\n- Descriptif et naturel\n- Inclure des mots-clés pertinents\n- En français\n\nRéponds en JSON:\n[{"src": "url", "alt": "texte alt", "length": 80}]`,
      }],
    });
    const text = response.content[0].text.trim();
    const parsed = JSON.parse(text);
    return { success: true, data: parsed, source: 'ai' };
  } catch (err) {
    console.error('[SEO] AI alt texts error:', err.message);
    const alts = images.map((img, i) => ({
      src: img.src || img,
      alt: `${img.context || 'Image'} - service professionnel`,
      length: 50,
      source: 'fallback',
    }));
    return { success: true, data: alts };
  }
}

export async function applyRecommendation(tenantId, recommendationId) {
  const { data, error } = await supabase
    .from('seo_recommendations_applied')
    .update({ applied: true, applied_at: new Date().toISOString() })
    .eq('id', recommendationId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== TOOLS ====================

export async function generateSitemap(tenantId, baseUrl) {
  if (!baseUrl) return { success: false, error: 'baseUrl requis' };

  const config = getTenantConfig(tenantId);
  const now = new Date().toISOString().split('T')[0];

  const pages = [
    { loc: baseUrl, priority: '1.0', changefreq: 'daily' },
    { loc: `${baseUrl}/services`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${baseUrl}/reserver`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${baseUrl}/a-propos`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${baseUrl}/contact`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${baseUrl}/galerie`, priority: '0.6', changefreq: 'weekly' },
    { loc: `${baseUrl}/avis`, priority: '0.6', changefreq: 'weekly' },
  ];

  // Add service category pages from tenant config
  if (config?.services) {
    const categories = new Set();
    Object.values(config.services).forEach(s => {
      if (s.category) categories.add(s.category);
    });
    for (const cat of categories) {
      pages.push({ loc: `${baseUrl}/services/${cat}`, priority: '0.7', changefreq: 'weekly' });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return { success: true, data: { xml, pages_count: pages.length } };
}

export async function generateSchemaOrg(tenantId, businessType) {
  const config = getTenantConfig(tenantId);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const openingHours = [];
  if (config?.businessHours) {
    for (const [day, hours] of Object.entries(config.businessHours)) {
      if (hours) {
        openingHours.push({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: dayNames[parseInt(day)],
          opens: hours.open,
          closes: hours.close,
        });
      }
    }
  }

  // Parse address components from tenant config
  const fullAddress = config?.adresse || '';
  const addressParts = fullAddress.match(/^(.+?),\s*(\d{5})\s+(.+)$/);

  const schema = {
    '@context': 'https://schema.org',
    '@type': businessType || (config?.secteur?.includes('oiffure') ? 'HairSalon' : 'LocalBusiness'),
    name: config?.name || tenantId,
    description: config?.concept || '',
    url: config?.domain ? `https://${config.domain}` : '',
    telephone: config?.telephone || '',
    address: {
      '@type': 'PostalAddress',
      streetAddress: addressParts ? addressParts[1].trim() : fullAddress,
      postalCode: addressParts ? addressParts[2] : '',
      addressLocality: addressParts ? addressParts[3].trim() : config?.ville || '',
      addressCountry: 'FR',
    },
    openingHoursSpecification: openingHours,
  };

  // Add services as offers
  if (config?.services) {
    const services = Object.values(config.services);
    const minPrice = Math.min(...services.map(s => s.price));
    const maxPrice = Math.max(...services.map(s => s.price));
    schema.priceRange = `${minPrice}€ - ${maxPrice}€`;
  }

  return {
    success: true,
    data: {
      schema,
      script_tag: `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>`,
    },
  };
}

export async function generateRobotsTxt(tenantId) {
  const config = getTenantConfig(tenantId);
  const siteUrl = config?.domain ? `https://${config.domain}` : 'https://localhost';

  const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /nexus/
Disallow: /private/
Disallow: /mon-compte/

User-agent: Googlebot
Allow: /

Sitemap: ${siteUrl}/sitemap.xml`;

  return { success: true, data: { content: robots } };
}

// ==================== STATS ====================

export async function getSEOOverview(tenantId) {
  const [auditsRes, keywordsRes, competitorsRes, recsRes] = await Promise.all([
    supabase.from('seo_audits').select('id, score, status, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5),
    supabase.from('seo_keywords').select('id, keyword, current_position, best_position, status').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('seo_competitors').select('id').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('seo_recommendations_applied').select('id, applied').eq('tenant_id', tenantId),
  ]);

  const audits = auditsRes.data || [];
  const keywords = keywordsRes.data || [];
  const competitors = competitorsRes.data || [];
  const recs = recsRes.data || [];

  const latestAudit = audits[0] || null;
  const avgPosition = keywords.length > 0
    ? Math.round(keywords.reduce((s, k) => s + (k.current_position || 100), 0) / keywords.length)
    : null;
  const top10 = keywords.filter(k => k.current_position && k.current_position <= 10).length;
  const top30 = keywords.filter(k => k.current_position && k.current_position <= 30).length;

  return {
    success: true,
    data: {
      latest_score: latestAudit ? latestAudit.score : null,
      total_audits: audits.length,
      keywords_tracked: keywords.length,
      avg_position: avgPosition,
      top_10: top10,
      top_30: top30,
      competitors_count: competitors.length,
      recommendations_total: recs.length,
      recommendations_applied: recs.filter(r => r.applied).length,
    },
  };
}

export async function getKeywordsTrends(tenantId, days = 30) {
  const { data: keywords } = await supabase
    .from('seo_keywords')
    .select('id, keyword')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (!keywords || keywords.length === 0) return { success: true, data: [] };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const trends = [];
  for (const kw of keywords) {
    const { data: positions } = await supabase
      .from('seo_positions')
      .select('position, checked_at')
      .eq('keyword_id', kw.id)
      .gte('checked_at', since.toISOString())
      .order('checked_at', { ascending: true });

    trends.push({
      keyword: kw.keyword,
      keyword_id: kw.id,
      positions: positions || [],
      data_points: (positions || []).length,
    });
  }

  return { success: true, data: trends };
}

export async function getCompetitorGap(tenantId) {
  const { data: competitors } = await supabase
    .from('seo_competitors')
    .select('id, name, url')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (!competitors || competitors.length === 0) {
    return { success: true, data: { competitors: [], gaps: [] } };
  }

  const { data: ourKeywords } = await supabase
    .from('seo_keywords')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const gaps = [];
  for (const comp of competitors) {
    const { data: compKws } = await supabase
      .from('seo_competitor_keywords')
      .select('keyword, position')
      .eq('competitor_id', comp.id);

    const compGaps = (compKws || [])
      .filter(ck => !(ourKeywords || []).find(ok => ok.keyword.toLowerCase() === ck.keyword.toLowerCase()))
      .map(ck => ({ keyword: ck.keyword, competitor_position: ck.position }));

    gaps.push({
      competitor: comp.name,
      competitor_id: comp.id,
      missing_keywords: compGaps.length,
      keywords: compGaps,
    });
  }

  return { success: true, data: { competitors: competitors.length, gaps } };
}

// ==================== HELPERS (internes) ====================

async function analyzePageSEO(url) {
  const issues = [];
  const checks = [];

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'NexusSEOBot/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        url,
        checks: [{ check: 'http_status', status: 'fail', detail: `HTTP ${response.status}`, severity: 'critical' }],
        issues: [{ type: 'http_status', severity: 'critical', message: `Le site retourne HTTP ${response.status}` }],
        crawledPages: 0,
      };
    }

    const html = await response.text();
    const isHttps = url.startsWith('https');

    // HTTPS
    checks.push({ check: 'https', status: isHttps ? 'pass' : 'fail', detail: isHttps ? 'HTTPS activé' : 'HTTP non sécurisé', severity: isHttps ? null : 'critical' });
    if (!isHttps) issues.push({ type: 'https', severity: 'critical', message: 'Le site n\'utilise pas HTTPS' });

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title) {
      checks.push({ check: 'meta_title', status: 'fail', detail: 'Title manquant', severity: 'critical' });
      issues.push({ type: 'meta_title', severity: 'critical', message: 'Balise <title> manquante' });
    } else {
      const ok = title.length >= 30 && title.length <= 60;
      checks.push({ check: 'meta_title', status: ok ? 'pass' : 'warning', detail: `Title présent (${title.length} chars)`, severity: ok ? null : 'warning' });
      if (!ok) issues.push({ type: 'meta_title', severity: 'warning', message: `Title de ${title.length} caractères (optimal: 30-60)` });
    }

    // Meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
                    || html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
    const metaDesc = descMatch ? descMatch[1].trim() : '';
    if (!metaDesc) {
      checks.push({ check: 'meta_description', status: 'fail', detail: 'Meta description manquante', severity: 'critical' });
      issues.push({ type: 'meta_description', severity: 'critical', message: 'Meta description manquante' });
    } else {
      const ok = metaDesc.length >= 120 && metaDesc.length <= 160;
      checks.push({ check: 'meta_description', status: ok ? 'pass' : 'warning', detail: `Meta description (${metaDesc.length} chars)`, severity: ok ? null : 'warning' });
      if (!ok) issues.push({ type: 'meta_description', severity: 'warning', message: `Meta description de ${metaDesc.length} chars (optimal: 120-160)` });
    }

    // H1
    const h1s = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || [];
    if (h1s.length === 0) {
      checks.push({ check: 'h1_tag', status: 'fail', detail: 'H1 manquant', severity: 'critical' });
      issues.push({ type: 'h1_tag', severity: 'critical', message: 'Aucune balise H1 trouvée' });
    } else if (h1s.length > 1) {
      checks.push({ check: 'h1_tag', status: 'warning', detail: `${h1s.length} H1 trouvés`, severity: 'warning' });
      issues.push({ type: 'h1_tag', severity: 'warning', message: `${h1s.length} balises H1 (recommandé: 1 seule)` });
    } else {
      checks.push({ check: 'h1_tag', status: 'pass', detail: 'H1 unique trouvé', severity: null });
    }

    // H2
    const h2s = html.match(/<h2[^>]*>/gi) || [];
    checks.push({ check: 'h2_tags', status: h2s.length > 0 ? 'pass' : 'info', detail: `${h2s.length} H2 trouvés`, severity: h2s.length > 0 ? null : 'info' });

    // Images alt
    const imgs = html.match(/<img[^>]*>/gi) || [];
    let missingAlt = 0;
    for (const img of imgs) {
      if (!img.match(/alt=["'][^"']+["']/i)) missingAlt++;
    }
    if (imgs.length > 0) {
      const ok = missingAlt === 0;
      checks.push({ check: 'images_alt', status: ok ? 'pass' : 'warning', detail: `${missingAlt}/${imgs.length} images sans alt`, severity: ok ? null : 'warning' });
      if (!ok) issues.push({ type: 'images_alt', severity: 'warning', message: `${missingAlt} image(s) sans attribut alt sur ${imgs.length}` });
    } else {
      checks.push({ check: 'images_alt', status: 'pass', detail: 'Aucune image', severity: null });
    }

    // Viewport (mobile)
    const hasViewport = /<meta[^>]*name=["']viewport["'][^>]*>/i.test(html);
    checks.push({ check: 'mobile_friendly', status: hasViewport ? 'pass' : 'warning', detail: hasViewport ? 'Viewport présent' : 'Viewport manquant', severity: hasViewport ? null : 'warning' });
    if (!hasViewport) issues.push({ type: 'mobile_friendly', severity: 'warning', message: 'Balise viewport manquante' });

    // Canonical
    const hasCanonical = /<link[^>]*rel=["']canonical["'][^>]*>/i.test(html);
    checks.push({ check: 'canonical', status: hasCanonical ? 'pass' : 'info', detail: hasCanonical ? 'Canonical présent' : 'Canonical manquant', severity: hasCanonical ? null : 'info' });

    // Open Graph
    const hasOG = /<meta[^>]*property=["']og:/i.test(html);
    checks.push({ check: 'open_graph', status: hasOG ? 'pass' : 'info', detail: hasOG ? 'Open Graph présent' : 'Open Graph manquant', severity: hasOG ? null : 'info' });
    if (!hasOG) issues.push({ type: 'open_graph', severity: 'info', message: 'Balises Open Graph recommandées' });

    // Internal links
    const links = html.match(/<a[^>]*href=["'][^"']*["'][^>]*>/gi) || [];
    const internalLinks = links.filter(l => {
      const m = l.match(/href=["']([^"']*?)["']/i);
      return m && (m[1].startsWith('/') || m[1].startsWith(url));
    });
    checks.push({ check: 'internal_links', status: internalLinks.length > 2 ? 'pass' : 'warning', detail: `${internalLinks.length} liens internes`, severity: internalLinks.length > 2 ? null : 'warning' });

    // URL structure
    checks.push({ check: 'url_structure', status: 'pass', detail: 'URL analysée', severity: null });

    return { url, checks, issues, crawledPages: 1 };
  } catch (err) {
    console.error('[SEO] Audit fetch error:', err.message);
    return {
      url,
      checks: [{ check: 'connectivity', status: 'fail', detail: err.message, severity: 'critical' }],
      issues: [{ type: 'connectivity', severity: 'critical', message: `Impossible d'accéder au site: ${err.message}` }],
      crawledPages: 0,
    };
  }
}

function calculateScore(results) {
  let score = 100;
  for (const issue of results.issues) {
    if (issue.severity === 'critical') score -= 10;
    else if (issue.severity === 'warning') score -= 5;
    else score -= 2;
  }
  return Math.max(0, Math.min(100, score));
}

function generateRecommendations(results) {
  const recs = [];
  for (const issue of results.issues) {
    if (issue.type === 'meta_description') {
      recs.push({ type: 'meta', text: 'Ajouter une meta description de 150-160 caractères', priority: 'high' });
    } else if (issue.type === 'images_alt') {
      recs.push({ type: 'alt', text: 'Ajouter des attributs alt à toutes les images', priority: 'medium' });
    } else if (issue.type === 'https') {
      recs.push({ type: 'security', text: 'Migrer vers HTTPS', priority: 'critical' });
    } else if (issue.type === 'page_speed') {
      recs.push({ type: 'performance', text: 'Optimiser la vitesse de chargement (images, CSS, JS)', priority: 'medium' });
    } else {
      recs.push({ type: issue.type, text: `Corriger: ${issue.message}`, priority: 'low' });
    }
  }
  return recs;
}
