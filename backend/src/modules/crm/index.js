export {
  getContacts, getContactById, createContact, updateContact, deleteContact,
  convertToClient, markAsLost,
  getQuotes, getQuoteById, createQuote, updateQuote, deleteQuote,
  sendQuote, acceptQuote, rejectQuote, convertQuoteToInvoice,
  getFollowUps, createFollowUp, completeFollowUp, cancelFollowUp,
  getContactInteractions, addInteraction,
  getCRMStats, getQuoteStats, getPipelineStats, getConversionFunnel
} from './crmService.js';
