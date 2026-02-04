#!/usr/bin/env node

/**
 * NEXUS Admin CLI
 *
 * Gestion centralisee de la plateforme NEXUS
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Commands
import { tenantCommands } from './commands/tenant.js';
import { metricsCommands } from './commands/metrics.js';
import { healthCommands } from './commands/health.js';
import { backupCommands } from './commands/backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf-8')
);

const program = new Command();

program
  .name('nexus-admin')
  .description(chalk.cyan('NEXUS Platform Admin CLI'))
  .version(packageJson.version);

// Banner
console.log(
  chalk.cyan.bold(`
+===========================================+
|                                           |
|         NEXUS ADMIN CLI v${packageJson.version}            |
|                                           |
|    Multi-Tenant Platform Manager          |
|                                           |
+===========================================+
`)
);

// Register commands
tenantCommands(program);
metricsCommands(program);
healthCommands(program);
backupCommands(program);

// Help if no command
if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv);
