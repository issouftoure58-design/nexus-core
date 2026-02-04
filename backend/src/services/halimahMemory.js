/**
 * SYSTÈME DE MÉMOIRE ÉVOLUTIVE HALIMAH PRO
 * Permet à Halimah d'apprendre, de mémoriser et de s'améliorer
 */

import { supabase } from '../config/supabase.js';

// ============================================================
// === MÉMORISER ===
// ============================================================

/**
 * Enregistrer un souvenir
 */
export async function remember({
  type,
  category,
  subjectType = null,
  subjectId = null,
  key,
  value,
  metadata = {},
  confidence = 0.5
}) {
  try {
    console.log(`[MEMORY] 💾 Mémorisation: ${type}/${category}/${key}`);

    // Vérifier si ce souvenir existe déjà
    const existing = await recall({ type, category, key, subjectId });

    if (existing) {
      // Mettre à jour et augmenter la confiance
      const newConfidence = Math.min(existing.confidence + 0.1, 1.0);

      const { data, error } = await supabase
        .from('halimah_memory')
        .update({
          value,
          confidence: newConfidence,
          use_count: (existing.use_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('[MEMORY] Erreur mise à jour:', error.message);
        return null;
      }

      console.log(`[MEMORY] 🔄 Souvenir renforcé (confiance: ${newConfidence.toFixed(2)})`);
      return data;
    }

    // Créer nouveau souvenir
    const { data, error } = await supabase
      .from('halimah_memory')
      .insert({
        type,
        category,
        subject_type: subjectType,
        subject_id: subjectId,
        key,
        value,
        metadata,
        confidence
      })
      .select()
      .single();

    if (error) {
      console.error('[MEMORY] Erreur création:', error.message);
      return null;
    }

    console.log(`[MEMORY] ✅ Nouveau souvenir créé: ${key}`);
    return data;
  } catch (err) {
    console.error('[MEMORY] Exception remember:', err);
    return null;
  }
}

/**
 * Se souvenir d'une info spécifique
 */
export async function recall({
  type = null,
  category = null,
  key = null,
  subjectId = null,
  minConfidence = 0.3
}) {
  try {
    let query = supabase
      .from('halimah_memory')
      .select('*')
      .gte('confidence', minConfidence);

    if (type) query = query.eq('type', type);
    if (category) query = query.eq('category', category);
    if (key) query = query.eq('key', key);
    if (subjectId) query = query.eq('subject_id', subjectId);

    const { data, error } = await query.order('confidence', { ascending: false });

    if (error) {
      console.error('[MEMORY] Erreur recall:', error.message);
      return null;
    }

    // Marquer comme utilisé
    if (data && data.length > 0) {
      await supabase
        .from('halimah_memory')
        .update({
          last_used: new Date().toISOString(),
          use_count: (data[0].use_count || 0) + 1
        })
        .eq('id', data[0].id);

      console.log(`[MEMORY] 🔍 Souvenir trouvé: ${data[0].key}`);
    }

    return data?.[0] || null;
  } catch (err) {
    console.error('[MEMORY] Exception recall:', err);
    return null;
  }
}

/**
 * Récupérer tous les souvenirs sur un sujet
 */
export async function recallAll({
  subjectType = null,
  subjectId = null,
  category = null,
  type = null,
  minConfidence = 0.3,
  limit = 50
}) {
  try {
    let query = supabase
      .from('halimah_memory')
      .select('*')
      .gte('confidence', minConfidence);

    if (subjectType) query = query.eq('subject_type', subjectType);
    if (subjectId) query = query.eq('subject_id', subjectId);
    if (category) query = query.eq('category', category);
    if (type) query = query.eq('type', type);

    const { data, error } = await query
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[MEMORY] Erreur recallAll:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[MEMORY] Exception recallAll:', err);
    return [];
  }
}

/**
 * Recherche dans la mémoire avec mots-clés
 */
export async function search(query, category = null, limit = 20) {
  try {
    const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    let dbQuery = supabase
      .from('halimah_memory')
      .select('*')
      .gte('confidence', 0.2);

    if (category) dbQuery = dbQuery.eq('category', category);

    const { data, error } = await dbQuery.order('confidence', { ascending: false });

    if (error) {
      console.error('[MEMORY] Erreur search:', error.message);
      return [];
    }

    // Filtrer par pertinence
    const results = (data || []).filter(memory => {
      const text = `${memory.key} ${memory.value}`.toLowerCase();
      return searchTerms.some(term => text.includes(term));
    });

    return results.slice(0, limit);
  } catch (err) {
    console.error('[MEMORY] Exception search:', err);
    return [];
  }
}

// ============================================================
// === APPRENDRE ===
// ============================================================

/**
 * Enregistrer un feedback
 */
export async function learnFromFeedback({
  conversationId = null,
  messageId = null,
  rating,
  feedbackType,
  comment = null,
  context = {}
}) {
  try {
    const { data, error } = await supabase
      .from('halimah_feedback')
      .insert({
        conversation_id: conversationId,
        message_id: messageId,
        rating,
        feedback_type: feedbackType,
        comment,
        context
      })
      .select()
      .single();

    if (error) {
      console.error('[MEMORY] Erreur feedback:', error.message);
      return null;
    }

    console.log(`[MEMORY] 📝 Feedback enregistré: ${feedbackType} (${rating}/5)`);

    // Si feedback négatif, diminuer la confiance des souvenirs liés
    if (rating <= 2 && context.memoryIds && Array.isArray(context.memoryIds)) {
      for (const memId of context.memoryIds) {
        const { data: mem } = await supabase
          .from('halimah_memory')
          .select('confidence')
          .eq('id', memId)
          .single();

        if (mem) {
          const newConfidence = Math.max(mem.confidence - 0.1, 0);
          await supabase
            .from('halimah_memory')
            .update({ confidence: newConfidence })
            .eq('id', memId);
        }
      }
    }

    // Si feedback positif, augmenter la confiance
    if (rating >= 4 && context.memoryIds && Array.isArray(context.memoryIds)) {
      for (const memId of context.memoryIds) {
        const { data: mem } = await supabase
          .from('halimah_memory')
          .select('confidence')
          .eq('id', memId)
          .single();

        if (mem) {
          const newConfidence = Math.min(mem.confidence + 0.05, 1.0);
          await supabase
            .from('halimah_memory')
            .update({ confidence: newConfidence })
            .eq('id', memId);
        }
      }
    }

    return data;
  } catch (err) {
    console.error('[MEMORY] Exception learnFromFeedback:', err);
    return null;
  }
}

/**
 * Apprendre une préférence client
 */
export async function learnClientPreference({
  clientId,
  preference,
  value,
  source = 'conversation'
}) {
  return await remember({
    type: 'preference',
    category: 'client',
    subjectType: 'client',
    subjectId: clientId,
    key: preference,
    value,
    metadata: { source },
    confidence: source === 'explicit' ? 0.9 : 0.6
  });
}

/**
 * Apprendre une préférence admin (Fatou)
 */
export async function learnAdminPreference({
  preference,
  value
}) {
  return await remember({
    type: 'preference',
    category: 'admin',
    key: preference,
    value,
    confidence: 0.9
  });
}

/**
 * Apprendre un fait business
 */
export async function learnBusinessFact({
  key,
  value,
  metadata = {}
}) {
  return await remember({
    type: 'fact',
    category: 'business',
    key,
    value,
    metadata,
    confidence: 0.8
  });
}

/**
 * Enregistrer un apprentissage (leçon apprise)
 */
export async function recordLearning({
  category,
  key,
  value,
  metadata = {}
}) {
  return await remember({
    type: 'learning',
    category,
    key,
    value,
    metadata,
    confidence: 0.7
  });
}

// ============================================================
// === INSIGHTS ===
// ============================================================

/**
 * Créer un insight
 */
export async function createInsight({
  insightType,
  title,
  description,
  data = {},
  priority = 5
}) {
  try {
    const { data: insight, error } = await supabase
      .from('halimah_insights')
      .insert({
        insight_type: insightType,
        title,
        description,
        data,
        priority
      })
      .select()
      .single();

    if (error) {
      console.error('[MEMORY] Erreur création insight:', error.message);
      return null;
    }

    console.log(`[MEMORY] 💡 Insight créé: ${title} (priorité: ${priority})`);
    return insight;
  } catch (err) {
    console.error('[MEMORY] Exception createInsight:', err);
    return null;
  }
}

/**
 * Récupérer les insights non traités
 */
export async function getPendingInsights(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('halimah_insights')
      .select('*')
      .eq('is_actioned', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[MEMORY] Erreur getPendingInsights:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[MEMORY] Exception getPendingInsights:', err);
    return [];
  }
}

/**
 * Marquer un insight comme traité
 */
export async function markInsightActioned(insightId) {
  try {
    const { data, error } = await supabase
      .from('halimah_insights')
      .update({
        is_actioned: true,
        actioned_at: new Date().toISOString()
      })
      .eq('id', insightId)
      .select()
      .single();

    if (error) {
      console.error('[MEMORY] Erreur markInsightActioned:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[MEMORY] Exception markInsightActioned:', err);
    return null;
  }
}

// ============================================================
// === OUBLIER ===
// ============================================================

/**
 * Oublier un souvenir spécifique
 */
export async function forget(memoryId) {
  try {
    const { error } = await supabase
      .from('halimah_memory')
      .delete()
      .eq('id', memoryId);

    if (error) {
      console.error('[MEMORY] Erreur forget:', error.message);
      return false;
    }

    console.log(`[MEMORY] 🗑️ Souvenir oublié: ${memoryId}`);
    return true;
  } catch (err) {
    console.error('[MEMORY] Exception forget:', err);
    return false;
  }
}

/**
 * Oublier par clé
 */
export async function forgetByKey(key, category = null) {
  try {
    let query = supabase
      .from('halimah_memory')
      .delete()
      .ilike('key', `%${key}%`);

    if (category) query = query.eq('category', category);

    const { data, error } = await query.select();

    if (error) {
      console.error('[MEMORY] Erreur forgetByKey:', error.message);
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      console.log(`[MEMORY] 🗑️ ${count} souvenir(s) oublié(s) pour: ${key}`);
    }
    return count;
  } catch (err) {
    console.error('[MEMORY] Exception forgetByKey:', err);
    return 0;
  }
}

// ============================================================
// === CONTEXTE CONVERSATION ===
// ============================================================

/**
 * Construire le contexte mémoire pour une conversation
 */
export async function buildMemoryContext({
  clientId = null,
  topic = null
}) {
  const context = {
    adminPreferences: [],
    clientInfo: [],
    relevantInsights: [],
    recentLearnings: [],
    businessFacts: []
  };

  try {
    // Préférences admin
    const adminPrefs = await recallAll({
      category: 'admin',
      type: 'preference',
      minConfidence: 0.5
    });
    context.adminPreferences = adminPrefs;

    // Faits business
    const businessFacts = await recallAll({
      category: 'business',
      minConfidence: 0.5
    });
    context.businessFacts = businessFacts;

    // Info client si spécifié
    if (clientId) {
      context.clientInfo = await recallAll({
        subjectType: 'client',
        subjectId: clientId,
        minConfidence: 0.3
      });
    }

    // Insights récents
    context.relevantInsights = await getPendingInsights(5);

    // Apprentissages récents (dernière semaine)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { data: recent } = await supabase
      .from('halimah_memory')
      .select('*')
      .eq('type', 'learning')
      .gte('created_at', oneWeekAgo.toISOString())
      .gte('confidence', 0.5)
      .order('created_at', { ascending: false })
      .limit(10);

    context.recentLearnings = recent || [];

  } catch (err) {
    console.error('[MEMORY] Exception buildMemoryContext:', err);
  }

  return context;
}

/**
 * Formater le contexte mémoire pour le prompt système
 */
export function formatMemoryContextForPrompt(context) {
  let prompt = '\n\n=== MA MÉMOIRE ===\n';

  // Préférences admin
  if (context.adminPreferences && context.adminPreferences.length > 0) {
    prompt += '\n**Préférences de Fatou :**\n';
    context.adminPreferences.forEach(p => {
      prompt += `- ${p.key}: ${p.value}\n`;
    });
  }

  // Faits business
  if (context.businessFacts && context.businessFacts.length > 0) {
    prompt += '\n**Ce que je sais sur le business :**\n';
    context.businessFacts.forEach(f => {
      prompt += `- ${f.key}: ${f.value}\n`;
    });
  }

  // Info client
  if (context.clientInfo && context.clientInfo.length > 0) {
    prompt += '\n**Ce que je sais sur ce client :**\n';
    context.clientInfo.forEach(c => {
      prompt += `- ${c.key}: ${c.value}\n`;
    });
  }

  // Insights
  if (context.relevantInsights && context.relevantInsights.length > 0) {
    prompt += '\n**Mes observations récentes :**\n';
    context.relevantInsights.forEach(i => {
      prompt += `- [${i.insight_type}] ${i.title}\n`;
    });
  }

  // Apprentissages
  if (context.recentLearnings && context.recentLearnings.length > 0) {
    prompt += '\n**Ce que j\'ai appris récemment :**\n';
    context.recentLearnings.forEach(l => {
      prompt += `- ${l.key}: ${l.value}\n`;
    });
  }

  prompt += '\n=== FIN MÉMOIRE ===\n';

  return prompt;
}

// ============================================================
// === STATISTIQUES ===
// ============================================================

/**
 * Obtenir les statistiques de la mémoire
 */
export async function getMemoryStats() {
  try {
    const { data: memories } = await supabase
      .from('halimah_memory')
      .select('type, category, confidence');

    const { count: insightCount } = await supabase
      .from('halimah_insights')
      .select('*', { count: 'exact', head: true })
      .eq('is_actioned', false);

    const { count: feedbackCount } = await supabase
      .from('halimah_feedback')
      .select('*', { count: 'exact', head: true });

    const stats = {
      totalMemories: memories?.length || 0,
      pendingInsights: insightCount || 0,
      totalFeedbacks: feedbackCount || 0,
      byType: {},
      byCategory: {},
      avgConfidence: 0
    };

    if (memories && memories.length > 0) {
      let totalConfidence = 0;
      memories.forEach(m => {
        stats.byType[m.type] = (stats.byType[m.type] || 0) + 1;
        stats.byCategory[m.category] = (stats.byCategory[m.category] || 0) + 1;
        totalConfidence += parseFloat(m.confidence) || 0;
      });
      stats.avgConfidence = (totalConfidence / memories.length).toFixed(2);
    }

    return stats;
  } catch (err) {
    console.error('[MEMORY] Exception getMemoryStats:', err);
    return null;
  }
}

// ============================================================
// === EXPORTS ===
// ============================================================

export default {
  // Mémoriser
  remember,
  recall,
  recallAll,
  search,

  // Apprendre
  learnFromFeedback,
  learnClientPreference,
  learnAdminPreference,
  learnBusinessFact,
  recordLearning,

  // Insights
  createInsight,
  getPendingInsights,
  markInsightActioned,

  // Oublier
  forget,
  forgetByKey,

  // Contexte
  buildMemoryContext,
  formatMemoryContextForPrompt,

  // Stats
  getMemoryStats
};
