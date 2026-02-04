export {
  getCampaigns, getCampaignById, createCampaign, updateCampaign, deleteCampaign,
  scheduleCampaign, sendCampaign, pauseCampaign, getCampaignStats,
  getSegments, createSegment, updateSegment, deleteSegment, refreshSegmentCount,
  getPromoCodes, createPromoCode, updatePromoCode, deletePromoCode,
  validatePromoCode, applyPromoCode, getPromoCodeStats,
  getReferrals, createReferral, completeReferral, rewardReferral, getReferralStats,
  getMarketingOverview, getCampaignPerformance, getPromoPerformance
} from './marketingService.js';
