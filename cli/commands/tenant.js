/**
 * Commandes gestion tenants
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { table } from 'table';
import {
  createTenant,
  listTenants,
  getTenant,
  enableFeature,
  disableFeature,
} from '../utils/api.js';

export function tenantCommands(program) {
  const tenant = program.command('tenant').description('Gestion des tenants');

  // === CREATE ===
  tenant
    .command('create <name>')
    .description('Creer un nouveau tenant')
    .option('-t, --tier <tier>', 'Plan tarifaire (starter/pro/business)', 'starter')
    .option('-d, --domain <domain>', 'Domaine custom')
    .option('-e, --email <email>', 'Email proprietaire')
    .option('-p, --phone <phone>', 'Telephone')
    .option('--interactive', 'Mode interactif (questionnaire)')
    .action(async (name, options) => {
      console.log(chalk.blue('\n  Creation nouveau tenant...\n'));

      let data = { name };

      if (options.interactive) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'businessType',
            message: 'Type de business:',
            default: 'commerce',
          },
          {
            type: 'list',
            name: 'tier',
            message: 'Plan tarifaire:',
            choices: ['starter', 'pro', 'business'],
            default: 'starter',
          },
          {
            type: 'input',
            name: 'email',
            message: 'Email proprietaire:',
            validate: (input) => input.includes('@') || 'Email invalide',
          },
          {
            type: 'input',
            name: 'phone',
            message: 'Telephone:',
            validate: (input) => input.length >= 10 || 'Telephone invalide',
          },
          {
            type: 'input',
            name: 'domain',
            message: 'Domaine (optionnel):',
          },
        ]);

        data = { ...data, ...answers };
      } else {
        data = {
          name,
          tier: options.tier,
          email: options.email,
          phone: options.phone,
          domain: options.domain,
        };
      }

      const spinner = ora('Creation en cours...').start();

      try {
        const result = await createTenant(data);

        spinner.succeed(chalk.green('Tenant cree avec succes!'));

        console.log(chalk.cyan('\n  Informations:'));
        console.log(`   ID: ${chalk.bold(result.tenantId)}`);
        console.log(`   Nom: ${chalk.bold(result.config.name)}`);
        console.log(`   Slug: ${chalk.bold(result.config.slug)}`);
        console.log(`   Plan: ${chalk.bold(result.config.billing.plan)}`);
        console.log(`   Statut: ${chalk.yellow(result.config.status)}`);

        console.log(chalk.cyan('\n  Prochaines etapes:'));
        console.log(
          `   1. Activer features: ${chalk.bold(`nexus-admin tenant enable <feature> ${result.tenantId}`)}`
        );
        console.log(`   2. Importer donnees (si besoin)`);
        console.log(
          `   3. Tester: ${chalk.bold(`nexus-admin tenant info ${result.tenantId}`)}`
        );
      } catch (error) {
        spinner.fail(chalk.red('Erreur creation tenant'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // === LIST ===
  tenant
    .command('list')
    .description('Lister tous les tenants')
    .option('-s, --status <status>', 'Filtrer par statut (active/pending/suspended)')
    .option('-t, --tier <tier>', 'Filtrer par plan (starter/pro/business)')
    .action(async (options) => {
      const spinner = ora('Chargement tenants...').start();

      try {
        const tenants = await listTenants(options);

        spinner.stop();

        if (tenants.length === 0) {
          console.log(chalk.yellow('\n  Aucun tenant trouve\n'));
          return;
        }

        console.log(chalk.cyan(`\n  ${tenants.length} tenant(s)\n`));

        const data = [
          [
            chalk.bold('ID'),
            chalk.bold('Nom'),
            chalk.bold('Statut'),
            chalk.bold('Plan'),
          ],
          ...tenants.map((t) => [
            t.id,
            t.name,
            t.status === 'active'
              ? chalk.green('Active')
              : chalk.yellow(t.status),
            t.tier || 'N/A',
          ]),
        ];

        console.log(
          table(data, {
            columns: {
              0: { alignment: 'right' },
            },
          })
        );
      } catch (error) {
        spinner.fail(chalk.red('Erreur chargement'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // === INFO ===
  tenant
    .command('info <id>')
    .description("Details d'un tenant")
    .action(async (id) => {
      const spinner = ora('Chargement...').start();

      try {
        const t = await getTenant(id);

        spinner.stop();

        console.log(chalk.cyan(`\n  Tenant #${id} - ${t.name}\n`));

        console.log(chalk.bold('Informations generales:'));
        console.log(
          `   Statut: ${t.status === 'active' ? chalk.green('Active') : chalk.yellow(t.status)}`
        );
        console.log(`   Plan: ${chalk.bold(t.tier || 'N/A')}`);
        console.log(`   Cree: ${t.created}`);
        console.log(
          `   Frozen: ${t.frozen ? chalk.red('Oui') : chalk.green('Non')}`
        );

        if (t.technical) {
          console.log(chalk.bold('\nTechnique:'));
          console.log(`   DB Schema: ${t.technical.database?.schema || 'public'}`);
          console.log(`   Domaine: ${t.technical.domain || 'N/A'}`);
          console.log(`   Region: ${t.technical.region || 'N/A'}`);
        }

        if (t.owner) {
          console.log(chalk.bold('\nProprietaire:'));
          console.log(`   Nom: ${t.owner.name}`);
          console.log(`   Email: ${t.owner.email || 'N/A'}`);
          console.log(`   Tel: ${t.owner.phone || 'N/A'}`);
        }

        console.log('');
      } catch (error) {
        spinner.fail(chalk.red('Erreur'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // === ENABLE FEATURE ===
  tenant
    .command('enable <feature> <id>')
    .description('Activer une feature pour un tenant')
    .action(async (feature, id) => {
      const spinner = ora(
        `Activation feature '${feature}' pour tenant ${id}...`
      ).start();

      try {
        await enableFeature(id, feature);

        spinner.succeed(chalk.green(`Feature '${feature}' activee!`));

        console.log(chalk.cyan('\n  Info:'));
        console.log(
          `   Le tenant ${id} peut maintenant utiliser '${feature}'`
        );
        console.log(`   Aucun redemarrage necessaire (hot reload)`);
      } catch (error) {
        spinner.fail(chalk.red('Erreur'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // === DISABLE FEATURE ===
  tenant
    .command('disable <feature> <id>')
    .description('Desactiver une feature pour un tenant')
    .action(async (feature, id) => {
      const spinner = ora(
        `Desactivation feature '${feature}' pour tenant ${id}...`
      ).start();

      try {
        await disableFeature(id, feature);

        spinner.succeed(chalk.green(`Feature '${feature}' desactivee!`));

        console.log(chalk.yellow('\n  Attention:'));
        console.log(
          `   Le tenant ${id} ne peut plus acceder a '${feature}'`
        );
        console.log(`   Routes associees retourneront 403`);
      } catch (error) {
        spinner.fail(chalk.red('Erreur'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });
}
