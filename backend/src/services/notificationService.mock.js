export async function envoyerConfirmation(rdv) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[SMS MOCK] Confirmation RDV');
  console.log('To:', rdv.client_telephone);
  console.log('Message:');
  console.log(`✅ RDV confirmé : ${rdv.service_nom}`);
  console.log(`📅 ${rdv.date} à ${rdv.heure}`);
  console.log(`📍 8 rue des Monts Rouges`);
  console.log(`💰 ${rdv.prix_total/100}€`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return { success: true, mock: true };
}

export async function envoyerRappel24h(rdv) {
  console.log('[SMS MOCK] Rappel 24h - RDV #' + rdv.id);
  return { success: true, mock: true };
}

export async function envoyerRemerciement(rdv) {
  console.log('[SMS MOCK] Remerciement - RDV #' + rdv.id);
  return { success: true, mock: true };
}
