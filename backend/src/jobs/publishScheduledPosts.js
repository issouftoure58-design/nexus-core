/**
 * Job pour publier les posts programmés
 * Vérifie toutes les minutes s'il y a des posts à publier
 */

import { publishToSocialMedia } from '../services/socialMediaService.js';

let isRunning = false;

export async function publishScheduledPosts() {
  // Éviter les exécutions concurrentes
  if (isRunning) {
    console.log('[SCHEDULED] Job déjà en cours, skip');
    return;
  }

  isRunning = true;

  try {
    // Import dynamique pour éviter les problèmes de dépendances circulaires
    const { supabase } = await import('../config/supabase.js');

    const now = new Date();

    // Récupérer les posts à publier (statut pending et heure passée)
    const { data: posts, error } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_time', now.toISOString());

    if (error) {
      // Si la table n'existe pas, ne pas logger d'erreur
      if (error.code === '42P01') {
        return;
      }
      console.error('[SCHEDULED] Erreur fetch:', error);
      return;
    }

    if (!posts || posts.length === 0) {
      return;
    }

    console.log(`[SCHEDULED] ${posts.length} post(s) à publier`);

    for (const post of posts) {
      try {
        console.log(`[SCHEDULED] Publication du post ${post.id}...`);

        const results = await publishToSocialMedia(
          post.platforms,
          post.content,
          post.media_url,
          post.media_type || 'image'
        );

        const allSuccess = results.resultats?.every(r => r.success) || false;

        // Mettre à jour le statut du post
        const { error: updateError } = await supabase
          .from('scheduled_posts')
          .update({
            status: allSuccess ? 'published' : 'failed',
            results: results,
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id);

        if (updateError) {
          console.error(`[SCHEDULED] Erreur update post ${post.id}:`, updateError);
        } else {
          console.log(`[SCHEDULED] Post ${post.id} - ${allSuccess ? '✅ Publié' : '❌ Échec'}`);
        }

        // Log détaillé des résultats
        if (results.resultats) {
          for (const result of results.resultats) {
            if (result.success) {
              console.log(`  ✅ ${result.platform}: ${result.message || 'OK'}`);
            } else {
              console.log(`  ❌ ${result.platform}: ${result.error}`);
            }
          }
        }

      } catch (postError) {
        console.error(`[SCHEDULED] Erreur publication post ${post.id}:`, postError);

        // Marquer comme failed en cas d'erreur
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'failed',
            results: { error: postError.message },
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id);
      }
    }

  } catch (error) {
    console.error('[SCHEDULED] Erreur générale:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Démarre le job de publication programmée
 * @param {number} intervalMs - Intervalle en millisecondes (défaut: 60000 = 1 minute)
 */
export function startScheduledPostsJob(intervalMs = 60 * 1000) {
  console.log('[SCHEDULED] Job de publication programmée démarré');
  console.log(`[SCHEDULED] Vérification toutes les ${intervalMs / 1000} secondes`);

  // Exécuter une première fois au démarrage
  publishScheduledPosts();

  // Puis à intervalle régulier
  const intervalId = setInterval(publishScheduledPosts, intervalMs);

  // Retourner l'ID pour pouvoir arrêter le job si nécessaire
  return intervalId;
}

/**
 * Arrête le job de publication programmée
 * @param {number} intervalId - L'ID retourné par startScheduledPostsJob
 */
export function stopScheduledPostsJob(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('[SCHEDULED] Job de publication programmée arrêté');
  }
}
