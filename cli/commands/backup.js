/**
 * Commandes backup
 */

import chalk from 'chalk';
import ora from 'ora';
import { backupTenant, listBackups } from '../utils/api.js';

export function backupCommands(program) {
  const backup = program.command('backup').description('Gestion backups');

  backup
    .command('create <tenantId>')
    .description("Creer backup d'un tenant")
    .action(async (tenantId) => {
      const spinner = ora(`Backup tenant ${tenantId}...`).start();

      try {
        const result = await backupTenant(tenantId);

        spinner.succeed(chalk.green('Backup cree!'));

        console.log(chalk.cyan('\n  Backup:'));
        console.log(`   Fichier: ${result.filename}`);
        console.log(`   Taille: ${result.size}`);
        console.log(`   Date: ${result.date}`);
      } catch (error) {
        spinner.fail(chalk.red('Erreur backup'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  backup
    .command('list')
    .description('Lister backups disponibles')
    .action(async () => {
      const spinner = ora('Chargement backups...').start();

      try {
        const backups = await listBackups();

        spinner.stop();

        if (backups.length === 0) {
          console.log(chalk.yellow('\n  Aucun backup trouve\n'));
          return;
        }

        console.log(chalk.cyan(`\n  ${backups.length} backup(s)\n`));

        backups.forEach((b) => {
          console.log(`   ${b.date} - ${b.filename} (${b.size})`);
        });

        console.log('');
      } catch (error) {
        spinner.fail(chalk.red('Erreur'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });
}
