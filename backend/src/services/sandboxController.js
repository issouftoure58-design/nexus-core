/**
 * Sandbox Controller
 * Point d'entrée pour toutes les opérations sandbox de Halimah
 */

import {
  SandboxModes,
  getMode,
  setMode,
  isProduction,
  isSimulation,
  simulatePost,
  analyzeContent,
  validatePost,
  getPendingValidations,
  getSimulatedPost,
  listSimulatedPosts,
  deleteSimulatedPost,
  cleanupSandbox,
  getSandboxStats
} from './sandboxService.js';

/**
 * Controller Sandbox - Interface unifiée
 */
export const SandboxController = {

  // ============ MODE MANAGEMENT ============

  /**
   * Obtenir le mode actuel
   */
  getMode() {
    return {
      success: true,
      mode: getMode(),
      modes: Object.values(SandboxModes),
      description: {
        simulation: 'Teste les actions sans rien exécuter',
        validation: 'Prépare les actions pour approbation',
        production: 'Exécute les actions réellement'
      }
    };
  },

  /**
   * Définir le mode sandbox
   */
  setMode(newMode) {
    try {
      const result = setMode(newMode);
      return {
        success: true,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Vérifier si on peut exécuter une action
   */
  canExecute() {
    return {
      canExecute: isProduction(),
      mode: getMode(),
      message: isProduction()
        ? 'Mode production - les actions seront exécutées'
        : `Mode ${getMode()} - les actions seront simulées`
    };
  },

  // ============ POST SIMULATION ============

  /**
   * Simuler un post Instagram
   */
  async simulateInstagramPost(content, options = {}) {
    return await simulatePost('instagram', {
      caption: content.caption || content,
      hashtags: content.hashtags,
      imagePath: content.imagePath || options.imagePath
    }, options);
  },

  /**
   * Simuler un post Facebook
   */
  async simulateFacebookPost(content, options = {}) {
    return await simulatePost('facebook', {
      text: content.text || content,
      imagePath: content.imagePath || options.imagePath
    }, options);
  },

  /**
   * Simuler un post TikTok
   */
  async simulateTikTokPost(content, options = {}) {
    return await simulatePost('tiktok', {
      caption: content.caption || content,
      hashtags: content.hashtags,
      videoPath: content.videoPath || options.videoPath
    }, options);
  },

  /**
   * Simuler un post générique
   */
  async simulatePost(platform, content, options = {}) {
    return await simulatePost(platform, content, options);
  },

  // ============ CONTENT ANALYSIS ============

  /**
   * Analyser un contenu
   */
  analyzeContent(content, platform = 'instagram') {
    const analysis = analyzeContent(content, platform);
    return {
      success: true,
      platform,
      analysis,
      summary: `Score: ${analysis.score}/${analysis.maxScore} (${analysis.grade}) - ${analysis.recommendation}`
    };
  },

  /**
   * Obtenir des suggestions d'amélioration
   */
  getSuggestions(content, platform = 'instagram') {
    const analysis = analyzeContent(content, platform);
    return {
      success: true,
      platform,
      score: analysis.score,
      grade: analysis.grade,
      warnings: analysis.warnings,
      suggestions: analysis.suggestions,
      recommendation: analysis.recommendation
    };
  },

  // ============ VALIDATION WORKFLOW ============

  /**
   * Approuver un post
   */
  async approvePost(postId, feedback = '') {
    return await validatePost(postId, true, feedback);
  },

  /**
   * Rejeter un post
   */
  async rejectPost(postId, reason = '') {
    return await validatePost(postId, false, reason);
  },

  /**
   * Lister les posts en attente
   */
  async getPendingPosts() {
    return await getPendingValidations();
  },

  // ============ POST MANAGEMENT ============

  /**
   * Récupérer un post par ID
   */
  async getPost(postId) {
    const post = await getSimulatedPost(postId);
    if (post) {
      return {
        success: true,
        post
      };
    }
    return {
      success: false,
      error: `Post ${postId} non trouvé`
    };
  },

  /**
   * Lister les posts
   */
  async listPosts(options = {}) {
    return await listSimulatedPosts(options);
  },

  /**
   * Supprimer un post
   */
  async deletePost(postId) {
    return await deleteSimulatedPost(postId);
  },

  // ============ MAINTENANCE ============

  /**
   * Nettoyer le sandbox
   */
  async cleanup(olderThanDays = 7) {
    return await cleanupSandbox(olderThanDays);
  },

  /**
   * Obtenir les statistiques
   */
  async getStats() {
    return await getSandboxStats();
  },

  // ============ HELPER: EXECUTE WITH SANDBOX ============

  /**
   * Exécuter une action en respectant le mode sandbox
   *
   * Usage:
   * const result = await SandboxController.executeWithSandbox(
   *   'instagram',
   *   { caption: 'Mon post', imagePath: '/path/to/image.jpg' },
   *   async (content) => {
   *     // Action de publication réelle
   *     return await ComputerUse.instagramPost(content.imagePath, content.caption);
   *   }
   * );
   */
  async executeWithSandbox(platform, content, productionAction) {
    const mode = getMode();

    // En mode simulation ou validation, on simule
    if (!isProduction()) {
      const simulation = await simulatePost(platform, content);
      return {
        ...simulation,
        executed: false,
        mode
      };
    }

    // En mode production, on exécute vraiment
    try {
      const result = await productionAction(content);
      return {
        success: true,
        executed: true,
        mode,
        result,
        message: `Action exécutée en production sur ${platform}`
      };
    } catch (error) {
      return {
        success: false,
        executed: false,
        mode,
        error: error.message,
        message: `Erreur lors de l'exécution sur ${platform}`
      };
    }
  },

  /**
   * Exécuter une action validée
   * Prend un post approuvé et l'exécute en production
   */
  async executeApprovedPost(postId, productionAction) {
    const post = await getSimulatedPost(postId);

    if (!post) {
      return {
        success: false,
        error: `Post ${postId} non trouvé`
      };
    }

    if (post.status !== 'approved') {
      return {
        success: false,
        error: `Post ${postId} n'est pas approuvé (status: ${post.status})`,
        hint: post.status === 'pending_validation'
          ? 'Utilisez approuver_post d\'abord'
          : 'Ce post ne peut pas être publié'
      };
    }

    try {
      const result = await productionAction(post.content);

      // Mettre à jour le statut
      post.status = 'published';
      post.publishedAt = new Date().toISOString();
      post.publishResult = result;

      return {
        success: true,
        postId,
        status: 'published',
        result,
        message: `Post ${postId} publié avec succès sur ${post.platform}`
      };
    } catch (error) {
      return {
        success: false,
        postId,
        error: error.message,
        message: `Erreur lors de la publication du post ${postId}`
      };
    }
  }
};

export default SandboxController;
