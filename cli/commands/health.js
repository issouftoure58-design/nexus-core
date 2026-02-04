/**
 * Commandes sante systeme
 */

import chalk from 'chalk';
import ora from 'ora';
import { getHealth } from '../utils/api.js';

export function healthCommands(program) {
  program
    .command('health')
    .description('Verifier sante de la plateforme')
    .action(async () => {
      const spinner = ora('Verification sante...').start();

      try {
        const health = await getHealth();

        spinner.stop();

        const statusColors = {
          healthy: chalk.green,
          warning: chalk.yellow,
          critical: chalk.red,
          unknown: chalk.gray,
        };

        const statusIcons = {
          healthy: '[OK]',
          warning: '[!]',
          critical: '[X]',
          unknown: '[?]',
        };

        const color = statusColors[health.status] || chalk.white;
        const icon = statusIcons[health.status] || '[?]';

        console.log('');
        console.log(
          color.bold(`${icon} NEXUS Platform: ${health.status.toUpperCase()}`)
        );
        console.log(color(`   ${health.message}`));
        console.log('');

        process.exit(health.status === 'healthy' ? 0 : 1);
      } catch (error) {
        spinner.fail(chalk.red('[X] Erreur connexion'));
        console.error(chalk.red(`   ${error.message}`));
        process.exit(1);
      }
    });
}
