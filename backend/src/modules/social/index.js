/**
 * Social Media Module
 * Re-exports pour accès simplifié
 */

export {
  PLATFORMS,
  POST_STATUS,
  POST_CATEGORIES,
  // Comptes
  getSocialAccounts,
  connectAccount,
  disconnectAccount,
  // Posts
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  schedulePost,
  // Calendrier
  getCalendar,
  // Templates
  getTemplates,
  createTemplate,
  applyTemplate,
  // Stats
  getPostStats,
} from './socialService.js';

export {
  generatePostIdeas,
  generateProductPost,
  generatePromoPost,
  suggestHashtags,
  suggestBestTimes,
  generateCommentReply,
  analyzeSentiment,
} from './socialAIService.js';
