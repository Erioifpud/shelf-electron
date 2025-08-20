/**
 * @fileoverview
 * The main entry point for the elep-dev command-line interface.
 * It defines the available commands using 'commander', parses arguments,
 * and delegates execution to the appropriate handlers. This file is written
 * to be compatible with CommonJS (CJS) for robust CLI execution.
 */

import { Command } from 'commander';
import { DtsGenerator } from './dts-generator.js';
import { DevServer } from './dev-server.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';

// CJS-compatible way to read package.json for version information.
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name(chalk.cyan('elep-dev'))
  .description(chalk.blue('🚀 A powerful CLI toolkit for developing Elep plugins.'))
  .version(pkg.version, '-v, --version', 'Output the current version of elep-dev');

program
  .command('dts')
  .summary('Generates the PluginApiMap for type-safe context.link() calls.')
  .description('🧬 Generates TypeScript definitions for plugin dependencies found in the `elep_plugins/` directory.')
  .option(
    '-o, --output <path>',
    'Output path for the .d.ts file (relative to project root)',
    'src/types/anvil.d.ts'
  )
  .action(async (options: { output: string }) => {
    const generator = new DtsGenerator(process.cwd());
    await generator.generate(options.output);
  });

program
  .command('dev')
  .summary('Launches your plugin with hot-reloading and dependency support.')
  .description('🔥 Starts the Elep application in development mode, loading the current plugin and all dependencies from `elep_plugins/`.')
  .action(async () => {
    const server = new DevServer(process.cwd());
    await server.start();
  });


/**
 * Main function to parse arguments and run the CLI.
 * This is exported to allow for programmatic use or testing if needed.
 */
export async function run() {
  await program.parseAsync(process.argv);
}

// This script is intended to be run as a standalone CLI tool.
// This guard prevents it from being executed if it's `require`d by another module.
if (require.main === module) {
  run();
} else {
  // Guide developers away from incorrect usage.
  console.error(chalk.red("The elep-dev CLI is not meant to be imported as a module."));
  console.error(chalk.yellow("Please run it directly from your terminal, e.g., 'npx elep-dev dev'."));
  process.exit(1);
}