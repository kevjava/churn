#!/usr/bin/env node

import { Command } from 'commander';
import { getContext, closeContext, initializeChurn } from './context';
import { isInitialized, getDefaultDbPath } from './config';
import { error, success } from './format';

// Import commands
import { registerTaskCommands } from './commands/task';
import { registerBucketCommands } from './commands/bucket';
import { registerPriorityCommand } from './commands/priority';
import { registerDataCommands } from './commands/data';
import { registerPlanCommands } from './commands/plan';

const program = new Command();

program
  .name('churn')
  .description('Time-decay-based task management with priority curves')
  .version('0.1.0')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--json', 'Output in JSON format')
  .option('--config <path>', 'Use alternate config file')
  .option('--db <path>', 'Use alternate database');

// init command
program
  .command('init')
  .description('Initialize churn database and configuration')
  .option('--force', 'Overwrite existing database')
  .action(async (options) => {
    try {
      if (isInitialized() && !options.force) {
        console.log('Churn is already initialized.');
        console.log(`Database: ${getDefaultDbPath()}`);
        console.log('Use --force to reinitialize.');
        return;
      }

      await initializeChurn();
      success('Churn initialized successfully!');
      console.log(`Database: ${getDefaultDbPath()}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Register command modules
registerTaskCommands(program);
registerBucketCommands(program);
registerPriorityCommand(program);
registerDataCommands(program);
registerPlanCommands(program);

// Handle cleanup on exit
process.on('beforeExit', async () => {
  await closeContext();
});

// Parse and execute
program.parseAsync(process.argv).catch((err) => {
  error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
