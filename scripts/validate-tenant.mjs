#!/usr/bin/env node
/**
 * Valide la configuration d'un tenant NEXUS
 * Usage: node scripts/validate-tenant.mjs [tenant-id]
 */

const tenantId = process.argv[2];

if (!tenantId) {
  console.error('Usage: node scripts/validate-tenant.mjs [tenant-id]');
  console.error('Exemple: node scripts/validate-tenant.mjs fatshairafro');
  process.exit(1);
}

console.log(`\n🔍 Validation du tenant: ${tenantId}\n`);

const errors = [];
const warnings = [];

try {
  const module = await import(`../backend/src/config/tenants/${tenantId}.js`);
  const config = module.default;

  if (!config) {
    console.error(`❌ Le fichier ${tenantId}.js n'exporte pas de config par defaut`);
    process.exit(1);
  }

  // === Checks obligatoires ===
  const required = [
    ['id', config.id],
    ['name', config.name],
    ['domain', config.domain],
    ['assistantName', config.assistantName],
    ['gerante', config.gerante],
    ['telephone', config.telephone],
    ['adresse', config.adresse],
    ['ville', config.ville],
    ['concept', config.concept],
    ['secteur', config.secteur],
  ];

  for (const [field, value] of required) {
    if (!value || value === 'template' || value === 'Nexus' && field === 'assistantName' && config.id !== 'template') {
      // assistantName = 'Nexus' is ok as default, skip warning for it
      if (field === 'assistantName' && value === 'Nexus') {
        warnings.push(`⚠️  ${field}: utilise le nom par defaut 'Nexus'`);
        continue;
      }
      errors.push(`❌ ${field} non configure`);
    } else {
      console.log(`✅ ${field}: ${value}`);
    }
  }

  // === Checks services ===
  const serviceKeys = Object.keys(config.services || {});
  if (serviceKeys.length === 0) {
    errors.push('❌ Aucun service configure');
  } else {
    console.log(`✅ ${serviceKeys.length} services configures`);

    // Verifier chaque service
    let serviceErrors = 0;
    for (const key of serviceKeys) {
      const svc = config.services[key];
      if (!svc.name || !svc.price || !svc.durationMinutes) {
        serviceErrors++;
      }
    }
    if (serviceErrors > 0) {
      errors.push(`❌ ${serviceErrors} service(s) incomplet(s) (name/price/duration manquant)`);
    }
  }

  // === Checks horaires ===
  const days = [0, 1, 2, 3, 4, 5, 6];
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  let openDays = 0;
  for (const day of days) {
    if (config.businessHours?.[day]) openDays++;
  }
  if (openDays === 0) {
    errors.push('❌ Aucun jour d\'ouverture configure');
  } else {
    const openDayNames = days
      .filter(d => config.businessHours?.[d])
      .map(d => dayNames[d]);
    console.log(`✅ ${openDays} jours d'ouverture: ${openDayNames.join(', ')}`);
  }

  // === Checks horairesTexte ===
  if (!config.horairesTexte) {
    warnings.push('⚠️  horairesTexte vide (le prompt IA n\'aura pas les horaires formates)');
  } else {
    console.log(`✅ horairesTexte configure`);
  }

  // === Checks plan ===
  const validPlans = ['starter', 'pro', 'business'];
  if (config.plan && !validPlans.includes(config.plan)) {
    errors.push(`❌ Plan invalide: '${config.plan}' (attendu: ${validPlans.join(' | ')})`);
  } else {
    console.log(`✅ plan: ${config.plan || 'starter (defaut)'}`);
  }

  // === Warnings ===
  if (config.meta?.status !== 'active') {
    warnings.push(`⚠️  meta.status: '${config.meta?.status || 'non defini'}' (pas encore actif)`);
  }

  if (!config.personality?.description) {
    warnings.push('⚠️  personality.description vide');
  }

  if (!config.notifications?.sms && !config.notifications?.email) {
    warnings.push('⚠️  Aucune notification activee (sms/email)');
  }

  // === Resume ===
  console.log('\n' + '='.repeat(50));

  if (errors.length > 0) {
    console.log('\n🚫 ERREURS:');
    errors.forEach(e => console.log('  ' + e));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(w => console.log('  ' + w));
  }

  if (errors.length === 0) {
    console.log(`\n✅ Tenant '${tenantId}' valide et pret !`);
    process.exit(0);
  } else {
    console.log(`\n❌ ${errors.length} erreur(s) a corriger`);
    process.exit(1);
  }
} catch (error) {
  console.error(`❌ Erreur: ${error.message}`);
  console.error(`   Le fichier backend/src/config/tenants/${tenantId}.js existe ?`);
  process.exit(1);
}
