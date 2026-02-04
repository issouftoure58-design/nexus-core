/**
 * Social Media Service
 * Gestion des posts et comptes sociaux
 */

import { supabase } from '../../config/supabase.js';

export const PLATFORMS = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  LINKEDIN: 'linkedin',
  X: 'x',
  TIKTOK: 'tiktok',
};

export const POST_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  FAILED: 'failed',
};

export const POST_CATEGORIES = {
  PROMO: 'promo',
  EVENT: 'event',
  PRODUCT: 'product',
  NEWS: 'news',
  TIPS: 'tips',
  BEHIND_SCENES: 'behind_scenes',
};

// ============ COMPTES SOCIAUX ============

export async function getSocialAccounts(tenantId) {
  try {
    const { data, error } = await supabase
      .from('social_accounts')
      .select('id, platform, account_name, account_id, is_active, connected_at, last_used_at')
      .eq('tenant_id', tenantId)
      .order('platform');

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SOCIAL] Error getting accounts:', err.message);
    return { success: false, error: err.message };
  }
}

export async function connectAccount(tenantId, accountData) {
  const { platform, accountName, accountId, accessToken, refreshToken, tokenExpiresAt, pageId } = accountData;

  try {
    const { data, error } = await supabase
      .from('social_accounts')
      .upsert({
        tenant_id: tenantId,
        platform,
        account_name: accountName,
        account_id: accountId,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        page_id: pageId,
        is_active: true,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,platform,account_id' })
      .select('id, platform, account_name, is_active')
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SOCIAL] Error connecting account:', err.message);
    return { success: false, error: err.message };
  }
}

export async function disconnectAccount(tenantId, accountId) {
  try {
    const { error } = await supabase
      .from('social_accounts')
      .delete()
      .eq('id', accountId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[SOCIAL] Error disconnecting account:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ POSTS ============

export async function getPosts(tenantId, options = {}) {
  try {
    const { status, category, limit = 50, offset = 0 } = options;

    let query = supabase
      .from('social_posts')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);

    const { data, error, count } = await query;
    if (error) throw error;
    return { success: true, data, count };
  } catch (err) {
    console.error('[SOCIAL] Error getting posts:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getPostById(tenantId, postId) {
  try {
    const { data, error } = await supabase
      .from('social_posts')
      .select('*')
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SOCIAL] Error getting post:', err.message);
    return { success: false, error: err.message };
  }
}

export async function createPost(tenantId, postData) {
  const { content, mediaUrls, linkUrl, platforms, scheduledAt, category, tags, createdBy } = postData;

  if (!content || !platforms || platforms.length === 0) {
    return { success: false, error: 'Contenu et plateformes requis' };
  }

  try {
    const status = scheduledAt ? POST_STATUS.SCHEDULED : POST_STATUS.DRAFT;

    const { data, error } = await supabase
      .from('social_posts')
      .insert({
        tenant_id: tenantId,
        content,
        media_urls: mediaUrls || [],
        link_url: linkUrl,
        platforms,
        status,
        scheduled_at: scheduledAt,
        category: category || null,
        tags: tags || [],
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SOCIAL] Error creating post:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updatePost(tenantId, postId, updates) {
  try {
    const { data: existing } = await supabase
      .from('social_posts')
      .select('status')
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .single();

    if (existing?.status === POST_STATUS.PUBLISHED) {
      return { success: false, error: 'Impossible de modifier un post publié' };
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.mediaUrls !== undefined) updateData.media_urls = updates.mediaUrls;
    if (updates.linkUrl !== undefined) updateData.link_url = updates.linkUrl;
    if (updates.platforms !== undefined) updateData.platforms = updates.platforms;
    if (updates.scheduledAt !== undefined) {
      updateData.scheduled_at = updates.scheduledAt;
      updateData.status = updates.scheduledAt ? POST_STATUS.SCHEDULED : POST_STATUS.DRAFT;
    }
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.tags !== undefined) updateData.tags = updates.tags;

    const { data, error } = await supabase
      .from('social_posts')
      .update(updateData)
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SOCIAL] Error updating post:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deletePost(tenantId, postId) {
  try {
    const { error } = await supabase
      .from('social_posts')
      .delete()
      .eq('id', postId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[SOCIAL] Error deleting post:', err.message);
    return { success: false, error: err.message };
  }
}

export async function schedulePost(tenantId, postId, scheduledAt) {
  try {
    const { data, error } = await supabase
      .from('social_posts')
      .update({
        scheduled_at: scheduledAt,
        status: POST_STATUS.SCHEDULED,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SOCIAL] Error scheduling post:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ CALENDRIER ============

export async function getCalendar(tenantId, startDate, endDate) {
  try {
    const { data, error } = await supabase
      .from('social_posts')
      .select('id, content, platforms, status, scheduled_at, category')
      .eq('tenant_id', tenantId)
      .gte('scheduled_at', startDate)
      .lte('scheduled_at', endDate)
      .order('scheduled_at');

    if (error) throw error;

    const calendar = {};
    for (const post of data) {
      const date = post.scheduled_at.split('T')[0];
      if (!calendar[date]) calendar[date] = [];
      calendar[date].push(post);
    }

    return { success: true, data: calendar };
  } catch (err) {
    console.error('[SOCIAL] Error getting calendar:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ TEMPLATES ============

export async function getTemplates(tenantId, options = {}) {
  try {
    const { category, businessType } = options;

    let query = supabase
      .from('social_templates')
      .select('*')
      .eq('is_active', true)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order('usage_count', { ascending: false });

    if (category) query = query.eq('category', category);
    if (businessType) query = query.or(`business_type.eq.${businessType},business_type.eq.all`);

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SOCIAL] Error getting templates:', err.message);
    return { success: false, error: err.message };
  }
}

export async function createTemplate(tenantId, templateData) {
  try {
    const { data, error } = await supabase
      .from('social_templates')
      .insert({
        tenant_id: tenantId,
        name: templateData.name,
        category: templateData.category,
        business_type: templateData.businessType || 'all',
        content_template: templateData.contentTemplate,
        suggested_media: templateData.suggestedMedia || [],
        suggested_hashtags: templateData.suggestedHashtags || [],
        platforms: templateData.platforms || [],
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SOCIAL] Error creating template:', err.message);
    return { success: false, error: err.message };
  }
}

export function applyTemplate(template, variables = {}) {
  let content = template.content_template;
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return {
    content,
    suggestedHashtags: template.suggested_hashtags,
    platforms: template.platforms,
  };
}

// ============ STATS ============

export async function getPostStats(tenantId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: posts, error } = await supabase
      .from('social_posts')
      .select('status, platforms, published_at, category')
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    const stats = {
      total: posts.length,
      byStatus: {},
      byPlatform: {},
      byCategory: {},
      published: 0,
      scheduled: 0,
      drafts: 0,
    };

    for (const post of posts) {
      stats.byStatus[post.status] = (stats.byStatus[post.status] || 0) + 1;
      if (post.status === POST_STATUS.PUBLISHED) stats.published++;
      if (post.status === POST_STATUS.SCHEDULED) stats.scheduled++;
      if (post.status === POST_STATUS.DRAFT) stats.drafts++;

      for (const platform of post.platforms || []) {
        stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1;
      }

      if (post.category) {
        stats.byCategory[post.category] = (stats.byCategory[post.category] || 0) + 1;
      }
    }

    return { success: true, data: stats };
  } catch (err) {
    console.error('[SOCIAL] Error getting stats:', err.message);
    return { success: false, error: err.message };
  }
}
