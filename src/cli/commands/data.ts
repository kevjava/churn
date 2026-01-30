import * as fs from 'fs';
import { Command } from 'commander';
import { getContext } from '../context';
import { success, error } from '../format';
import { ExportData } from '@kevjava/churn-core';

export function registerDataCommands(program: Command): void {
  // export command
  program
    .command('export')
    .description('Export all data to JSON')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (options) => {
      await exportData(options, program.opts());
    });

  // import command
  program
    .command('import <file>')
    .description('Import data from JSON')
    .option('--merge', 'Merge with existing data (default: replace)')
    .action(async (file: string, options) => {
      await importData(file, options, program.opts());
    });
}

async function exportData(
  options: { output?: string },
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const data = await ctx.db.export();
    const json = JSON.stringify(data, null, 2);

    if (options.output) {
      fs.writeFileSync(options.output, json);
      success(`Exported to ${options.output}`);
      console.log(`  Buckets: ${data.buckets.length}`);
      console.log(`  Tasks: ${data.tasks.length}`);
      console.log(`  Completions: ${data.completions.length}`);
    } else {
      console.log(json);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function importData(
  file: string,
  options: { merge?: boolean },
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    // Read and parse the file
    if (!fs.existsSync(file)) {
      error(`File not found: ${file}`);
      process.exit(1);
    }

    const content = fs.readFileSync(file, 'utf-8');
    let data: ExportData;

    try {
      data = JSON.parse(content);
    } catch {
      error('Invalid JSON file');
      process.exit(1);
    }

    // Validate the data structure
    if (!data.version || !data.tasks || !data.buckets || !data.completions) {
      error('Invalid export file format');
      process.exit(1);
    }

    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const merge = options.merge ?? false;

    if (!merge) {
      console.log('Warning: This will replace all existing data.');
      console.log('Use --merge to add to existing data instead.');
      console.log('');
    }

    const result = await ctx.db.import(data, merge);

    success(`Import complete${merge ? ' (merged)' : ''}`);
    console.log(`  Buckets: ${result.buckets.imported} imported, ${result.buckets.skipped} skipped`);
    console.log(`  Tasks: ${result.tasks.imported} imported, ${result.tasks.skipped} skipped`);
    console.log(`  Completions: ${result.completions.imported} imported, ${result.completions.skipped} skipped`);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
