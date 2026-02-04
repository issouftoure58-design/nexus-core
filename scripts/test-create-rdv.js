/**
 * Test de creation de RDV via createReservationUnified
 * Usage: node scripts/test-create-rdv.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { createReservationUnified } from '../backend/src/core/unified/nexusCore.js';

async function testCreateRdv() {
  console.log('=================================================');
  console.log('TEST: createReservationUnified');
  console.log('=================================================\n');

  // Calculer une date dans le futur (mardi prochain pour éviter conflit)
  const today = new Date();
  const daysUntilTuesday = (9 - today.getDay()) % 7 || 7;
  const nextTuesday = new Date(today);
  nextTuesday.setDate(today.getDate() + daysUntilTuesday);
  const dateRdv = nextTuesday.toISOString().split('T')[0];

  const testData = {
    service_name: 'Braids',
    date: dateRdv,
    heure: '10:00',
    client_nom: 'Test Client',
    client_prenom: 'Marie',
    client_telephone: '0612345678',
    client_email: 'test@example.com',
    lieu: 'domicile',
    adresse: '10 rue de la Paix, 75002 Paris'
  };

  console.log('Donnees de test:', JSON.stringify(testData, null, 2));
  console.log('\n-------------------------------------------------\n');

  try {
    const result = await createReservationUnified(testData, 'test', {
      sendSMS: false,  // Pas de SMS pour le test
      skipValidation: false
    });

    console.log('\n-------------------------------------------------');
    console.log('RESULTAT:', JSON.stringify(result, null, 2));
    console.log('-------------------------------------------------\n');

    if (result.success) {
      console.log('SUCCESS! Reservation ID:', result.reservationId);
      console.log('Recap:', result.recap);
    } else {
      console.log('ECHEC:', result.error || result.errors);
    }

  } catch (error) {
    console.error('EXCEPTION:', error.message);
    console.error('Stack:', error.stack);
  }

  console.log('\n=================================================');
  process.exit(0);
}

testCreateRdv();
