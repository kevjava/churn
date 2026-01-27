import { Command } from 'commander';
import { getContext } from '../context';
import { formatBucketTable, success, error } from '../format';

export function registerBucketCommands(program: Command): void {
  const bucket = program
    .command('bucket')
    .description('Bucket management commands');

  // bucket create
  bucket
    .command('create <name>')
    .description('Create a new bucket')
    .option('--type <type>', 'Bucket type (project, category, context)', 'category')
    .action(async (name: string, options) => {
      await createBucket(name, options, program.opts());
    });

  // bucket list
  bucket
    .command('list')
    .description('List all buckets')
    .action(async () => {
      await listBuckets(program.opts());
    });

  // Shortcut: churn buckets
  program
    .command('buckets')
    .description('List all buckets (shortcut)')
    .action(async () => {
      await listBuckets(program.opts());
    });

  // bucket show
  bucket
    .command('show <id>')
    .description('Show bucket details and tasks')
    .action(async (id: string) => {
      await showBucket(id, program.opts());
    });

  // bucket delete
  bucket
    .command('delete <id>')
    .description('Delete a bucket')
    .action(async (id: string) => {
      await deleteBucket(id, program.opts());
    });
}

async function createBucket(
  name: string,
  options: { type: string },
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const validTypes = ['project', 'category', 'context'];
    if (!validTypes.includes(options.type)) {
      error(`Invalid bucket type: ${options.type}. Must be one of: ${validTypes.join(', ')}`);
      process.exit(1);
    }

    const bucket = await ctx.buckets.create({
      name,
      type: options.type as 'project' | 'category' | 'context',
    });

    success(`Created bucket #${bucket.id}: ${bucket.name} (${bucket.type})`);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function listBuckets(
  globalOpts: { verbose?: boolean; json?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const buckets = await ctx.buckets.list();

    // Get task counts for each bucket
    const bucketsWithCounts = await Promise.all(
      buckets.map(async (bucket) => {
        const tasks = await ctx.buckets.getTasks(bucket.id);
        return { bucket, taskCount: tasks.length };
      })
    );

    if (globalOpts.json) {
      console.log(JSON.stringify(bucketsWithCounts.map(b => ({
        ...b.bucket,
        taskCount: b.taskCount,
      })), null, 2));
    } else {
      console.log(formatBucketTable(bucketsWithCounts));
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function showBucket(
  idOrName: string,
  globalOpts: { verbose?: boolean; json?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    // Try to find by ID first, then by name
    let bucket = null;
    const id = parseInt(idOrName, 10);
    if (!isNaN(id)) {
      bucket = await ctx.buckets.get(id);
    }
    if (!bucket) {
      bucket = await ctx.buckets.getByName(idOrName);
    }

    if (!bucket) {
      error(`Bucket not found: ${idOrName}`);
      process.exit(1);
    }

    const tasks = await ctx.buckets.getTasks(bucket.id);

    if (globalOpts.json) {
      console.log(JSON.stringify({
        ...bucket,
        tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
      }, null, 2));
      return;
    }

    console.log(`Bucket #${bucket.id}: ${bucket.name}`);
    console.log(`Type: ${bucket.type}`);
    console.log(`Tasks: ${tasks.length}`);

    if (bucket.config && Object.keys(bucket.config).length > 0) {
      console.log(`Config: ${JSON.stringify(bucket.config)}`);
    }

    if (tasks.length > 0) {
      console.log('');
      console.log('Tasks in this bucket:');
      for (const task of tasks.slice(0, 10)) {
        console.log(`  #${task.id}: ${task.title}`);
      }
      if (tasks.length > 10) {
        console.log(`  ... and ${tasks.length - 10} more`);
      }
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function deleteBucket(
  idOrName: string,
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    // Try to find by ID first, then by name
    let bucket = null;
    const id = parseInt(idOrName, 10);
    if (!isNaN(id)) {
      bucket = await ctx.buckets.get(id);
    }
    if (!bucket) {
      bucket = await ctx.buckets.getByName(idOrName);
    }

    if (!bucket) {
      error(`Bucket not found: ${idOrName}`);
      process.exit(1);
    }

    const tasks = await ctx.buckets.getTasks(bucket.id);

    await ctx.buckets.delete(bucket.id);
    success(`Deleted bucket #${bucket.id}: ${bucket.name}`);

    if (tasks.length > 0) {
      console.log(`Note: ${tasks.length} task(s) were in this bucket (now unassigned)`);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
