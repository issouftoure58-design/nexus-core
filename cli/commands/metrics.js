/**
 * Commandes metriques
 */

import chalk from 'chalk';
import ora from 'ora';
import { getGlobalMetrics, getTenantMetrics } from '../utils/api.js';

export function metricsCommands(program) {
  const metrics = program.command('metrics').description('Metriques et monitoring');

  // === GLOBAL ===
  metrics
    .command('global')
    .description('Metriques globales plateforme')
    .action(async () => {
      const spinner = ora('Recuperation metriques...').start();

      try {
        const data = await getGlobalMetrics();

        spinner.stop();

        console.log(chalk.cyan('\n  METRIQUES GLOBALES NEXUS\n'));

        console.log(chalk.bold('Tenants:'));
        console.log(`   Total: ${chalk.bold(data.orchestrator.totalTenants)}`);
        console.log(`   Actifs: ${chalk.green(data.orchestrator.activeTenants)}`);

        console.log(chalk.bold('\nRequetes:'));
        console.log(`   Total: ${chalk.bold(data.orchestrator.totalRequests)}`);
        console.log(
          `   Erreurs: ${data.orchestrator.totalErrors > 0 ? chalk.red(data.orchestrator.totalErrors) : chalk.green(0)}`
        );
        console.log(
          `   Taux erreur: ${(data.orchestrator.errorRate * 100).toFixed(2)}%`
        );

        console.log(chalk.bold('\nPerformance:'));
        console.log(
          `   Temps reponse moy: ${data.performance.avgResponseTime}ms`
        );
        console.log(
          `   Requetes/min: ${data.performance.requestsPerMinute}`
        );

        console.log(chalk.bold('\nSysteme:'));
        console.log(`   CPU: ${data.system.cpuUsage}%`);
        console.log(
          `   RAM: ${data.system.memoryUsage.used}MB / ${data.system.memoryUsage.total}MB (${data.system.memoryUsage.percentage}%)`
        );
        console.log(
          `   Uptime: ${Math.floor(data.system.uptime / 3600)}h ${Math.floor((data.system.uptime % 3600) / 60)}min`
        );

        console.log('');
      } catch (error) {
        spinner.fail(chalk.red('Erreur'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // === TENANT ===
  metrics
    .command('tenant <id>')
    .description("Metriques d'un tenant")
    .action(async (id) => {
      const spinner = ora(
        `Recuperation metriques tenant ${id}...`
      ).start();

      try {
        const data = await getTenantMetrics(id);

        spinner.stop();

        console.log(chalk.cyan(`\n  Metriques Tenant #${id} - ${data.name}\n`));

        console.log(chalk.bold('Activite:'));
        console.log(`   Requetes: ${chalk.bold(data.metrics.requests)}`);
        console.log(
          `   Erreurs: ${data.metrics.errors > 0 ? chalk.red(data.metrics.errors) : chalk.green(0)}`
        );
        console.log(
          `   Taux erreur: ${(data.metrics.errorRate * 100).toFixed(2)}%`
        );

        console.log('');
      } catch (error) {
        spinner.fail(chalk.red('Erreur'));
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });
}
