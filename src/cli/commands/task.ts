import { Command } from 'commander';
import { TaskParser, ChurnParsedTask } from '@kevjava/task-parser';
import { getContext } from '../context';
import {
  formatTaskTable,
  formatTaskDetail,
  success,
  error,
  formatDate,
  formatDuration,
} from '../format';
import { TaskStatus, CurveType, CreateTaskInput, RecurrencePattern, RecurrenceMode, RecurrenceType } from '@kevjava/churn-core';

export function registerTaskCommands(program: Command): void {
  const task = program
    .command('task')
    .description('Task management commands');

  const configureCreateCommand = (cmd: Command) =>
    cmd
      .option('--curve <type>', 'Override curve type (linear, exponential)')
      .option('--exponent <n>', 'Set exponential curve exponent', parseFloat)
      .action(async (descriptionParts: string[], options) => {
        await createTask(descriptionParts.join(' '), options, program.opts());
      });

  const configureListCommand = (cmd: Command) =>
    cmd
      .option('--status <status>', 'Filter by status')
      .option('--project <name>', 'Filter by project')
      .option('--bucket <name>', 'Filter by bucket')
      .option('--tag <tag>', 'Filter by tag', collect, [])
      .option('--priority', 'Sort by priority')
      .option('--limit <n>', 'Limit results', parseInt, 50)
      .option('--overdue', 'Show only overdue tasks')
      .option('--recurring', 'Show only recurring tasks')
      .action(async (options) => {
        await listTasks(options, program.opts());
      });

  // task create / task add
  configureCreateCommand(task.command('create <description...>').description('Create a new task'));
  configureCreateCommand(task.command('add <description...>').description('Create a new task (synonym for create)'));

  // Shortcuts: churn create, churn add
  configureCreateCommand(program.command('create <description...>').description('Create a new task (shortcut for task create)'));
  configureCreateCommand(program.command('add <description...>').description('Create a new task (shortcut for task create)'));

  // task list
  configureListCommand(task.command('list').description('List tasks'));

  // Shortcuts: churn list, churn ls
  configureListCommand(program.command('list').description('List tasks (shortcut)'));
  configureListCommand(program.command('ls').description('List tasks (shortcut)'));

  const configureShowCommand = (cmd: Command) =>
    cmd.action(async (id: string) => {
      await showTask(parseInt(id, 10), program.opts());
    });

  // task show
  configureShowCommand(task.command('show <id>').description('Show task details'));

  // Shortcut: churn show
  configureShowCommand(program.command('show <id>').description('Show task details (shortcut)'));

  const configureUpdateCommand = (cmd: Command) =>
    cmd
      .option('--title <text>', 'New title')
      .option('--deadline <date>', 'New deadline')
      .option('--project <name>', 'Change project')
      .option('--add-tag <tag>', 'Add tag', collect, [])
      .option('--remove-tag <tag>', 'Remove tag', collect, [])
      .option('--estimate <duration>', 'New estimate')
      .option('--bucket <id>', 'Change bucket', parseInt)
      .action(async (id: string, options) => {
        await updateTask(parseInt(id, 10), options, program.opts());
      });

  // task update / task edit
  configureUpdateCommand(task.command('update <id>').description('Update a task'));
  configureUpdateCommand(task.command('edit <id>').description('Update a task (synonym for update)'));

  // Shortcuts: churn update, churn edit
  configureUpdateCommand(program.command('update <id>').description('Update a task (shortcut)'));
  configureUpdateCommand(program.command('edit <id>').description('Update a task (shortcut for task update)'));

  const configureCompleteCommand = (cmd: Command) =>
    cmd
      .option('--at <datetime>', 'Completion time')
      .action(async (id: string, options) => {
        await completeTask(parseInt(id, 10), options, program.opts());
      });

  // task complete
  configureCompleteCommand(task.command('complete <id>').description('Mark task as complete'));

  // Shortcuts: churn complete, churn done
  configureCompleteCommand(program.command('complete <id>').description('Mark task as complete (shortcut)'));
  configureCompleteCommand(program.command('done <id>').description('Mark task as complete (shortcut)'));

  const configureDeleteCommand = (cmd: Command) =>
    cmd
      .option('--force', 'Skip confirmation')
      .action(async (id: string, options) => {
        await deleteTask(parseInt(id, 10), options, program.opts());
      });

  // task delete
  configureDeleteCommand(task.command('delete <id>').description('Delete a task'));

  // Shortcuts: churn delete, churn rm
  configureDeleteCommand(program.command('delete <id>').description('Delete a task (shortcut)'));
  configureDeleteCommand(program.command('rm <id>').description('Delete a task (shortcut)'));

  const configureReopenCommand = (cmd: Command) =>
    cmd.action(async (id: string) => {
      await reopenTask(parseInt(id, 10), program.opts());
    });

  // task reopen
  configureReopenCommand(task.command('reopen <id>').description('Reopen a completed task'));

  // Shortcut: churn reopen
  configureReopenCommand(program.command('reopen <id>').description('Reopen a completed task (shortcut)'));

  const configureSearchCommand = (cmd: Command) =>
    cmd.action(async (queryParts: string[]) => {
      await searchTasks(queryParts.join(' '), program.opts());
    });

  // task search
  configureSearchCommand(task.command('search <query...>').description('Search tasks'));

  // Shortcut: churn search
  configureSearchCommand(program.command('search <query...>').description('Search tasks (shortcut)'));
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

async function createTask(
  description: string,
  options: { curve?: string; exponent?: number },
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const { input, bucketName } = parseTaskDescription(description, options);

    // Look up bucket by name if specified
    if (bucketName) {
      const buckets = await ctx.buckets.list();
      const bucket = buckets.find(
        (b) => b.name.toLowerCase() === bucketName.toLowerCase()
      );
      if (bucket) {
        input.bucket_id = bucket.id;
      } else {
        console.log(`Warning: Bucket "${bucketName}" not found, ignoring.`);
      }
    }

    const task = await ctx.tasks.create(input);

    success(`Created task #${task.id}: ${task.title}`);

    if (ctx.verbose) {
      if (task.project) console.log(`  Project: ${task.project}`);
      if (task.tags.length > 0) console.log(`  Tags: ${task.tags.join(', ')}`);
      if (task.deadline) console.log(`  Deadline: ${formatDate(task.deadline)}`);
      if (task.estimate_minutes) console.log(`  Estimate: ${formatDuration(task.estimate_minutes)}`);
      if (task.bucket_id) console.log(`  Bucket: ${bucketName}`);
      console.log(`  Curve: ${task.curve_config.type}`);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function listTasks(
  options: {
    status?: string;
    project?: string;
    bucket?: string;
    tag?: string[];
    priority?: boolean;
    limit?: number;
    overdue?: boolean;
    recurring?: boolean;
  },
  globalOpts: { verbose?: boolean; json?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    let tasks;
    if (options.priority) {
      tasks = await ctx.tasks.getByPriority(options.limit);
    } else {
      const filter: {
        status?: TaskStatus;
        project?: string;
        bucket_id?: number;
        tags?: string[];
        overdue?: boolean;
        has_recurrence?: boolean;
      } = {};

      if (options.status) {
        filter.status = options.status as TaskStatus;
      }
      if (options.project) {
        filter.project = options.project;
      }
      if (options.tag && options.tag.length > 0) {
        filter.tags = options.tag;
      }
      if (options.overdue) {
        filter.overdue = true;
      }
      if (options.recurring) {
        filter.has_recurrence = true;
      }

      tasks = await ctx.tasks.list(filter);

      if (options.limit && tasks.length > options.limit) {
        tasks = tasks.slice(0, options.limit);
      }
    }

    if (globalOpts.json) {
      console.log(JSON.stringify(tasks, null, 2));
    } else {
      console.log(formatTaskTable(tasks, options.priority ?? false));
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function showTask(
  id: number,
  globalOpts: { verbose?: boolean; json?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const task = await ctx.tasks.get(id);
    if (!task) {
      error(`Task #${id} not found`);
      process.exit(1);
    }

    const priority = await ctx.tasks.calculatePriority(id);
    const deps = await ctx.tasks.getDependencies(id);
    const dependents = await ctx.tasks.getDependents(id);

    if (globalOpts.json) {
      console.log(JSON.stringify({
        ...task,
        priority,
        dependencies: deps.map(d => ({ id: d.id, title: d.title })),
        dependents: dependents.map(d => ({ id: d.id, title: d.title })),
      }, null, 2));
    } else {
      console.log(formatTaskDetail(task, priority, deps, dependents));
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function updateTask(
  id: number,
  options: {
    title?: string;
    deadline?: string;
    project?: string;
    addTag?: string[];
    removeTag?: string[];
    estimate?: string;
    bucket?: number;
  },
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const task = await ctx.tasks.get(id);
    if (!task) {
      error(`Task #${id} not found`);
      process.exit(1);
    }

    const updates: Record<string, unknown> = {};

    if (options.title) updates.title = options.title;
    if (options.deadline) updates.deadline = parseDate(options.deadline);
    if (options.project) updates.project = options.project;
    if (options.bucket) updates.bucket_id = options.bucket;

    if (options.estimate) {
      updates.estimate_minutes = parseDuration(options.estimate);
    }

    // Handle tags
    let tags = [...task.tags];
    if (options.addTag) {
      for (const tag of options.addTag) {
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
    if (options.removeTag) {
      tags = tags.filter((t) => !options.removeTag!.includes(t));
    }
    if (options.addTag || options.removeTag) {
      updates.tags = tags;
    }

    const updated = await ctx.tasks.update(id, updates);
    success(`Updated task #${id}: ${updated.title}`);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function completeTask(
  id: number,
  options: { at?: string },
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const task = await ctx.tasks.get(id);
    if (!task) {
      error(`Task #${id} not found`);
      process.exit(1);
    }

    const completedAt = options.at ? new Date(options.at) : undefined;
    await ctx.tasks.complete(id, completedAt);

    success(`Task #${id} completed: ${task.title}`);

    if (task.recurrence_pattern) {
      const updated = await ctx.tasks.get(id);
      if (updated?.next_due_at) {
        console.log(`Next due: ${formatDate(updated.next_due_at)}`);
      }
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function deleteTask(
  id: number,
  options: { force?: boolean },
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const task = await ctx.tasks.get(id);
    if (!task) {
      error(`Task #${id} not found`);
      process.exit(1);
    }

    // Check for dependents
    const dependents = await ctx.tasks.getDependents(id);
    if (dependents.length > 0 && !options.force) {
      error(`Task #${id} has dependents: ${dependents.map((d) => `#${d.id}`).join(', ')}`);
      console.log('Use --force to delete anyway (will unblock dependents).');
      process.exit(1);
    }

    await ctx.tasks.delete(id);
    success(`Deleted task #${id}: ${task.title}`);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function reopenTask(
  id: number,
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const task = await ctx.tasks.get(id);
    if (!task) {
      error(`Task #${id} not found`);
      process.exit(1);
    }

    await ctx.tasks.reopen(id);
    success(`Reopened task #${id}: ${task.title}`);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function searchTasks(
  query: string,
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const tasks = await ctx.tasks.search(query);
    console.log(formatTaskTable(tasks, false));
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Result from parsing task description
interface ParsedTaskInput {
  input: CreateTaskInput;
  bucketName?: string; // Needs lookup by name
}

// Parse task description using task-parser library
function parseTaskDescription(
  description: string,
  options: { curve?: string; exponent?: number }
): ParsedTaskInput {
  const parsed = TaskParser.parseChurn(description);

  const input: CreateTaskInput = {
    title: parsed.title,
    tags: parsed.tags,
  };

  if (!input.title) {
    throw new Error('Task title is required');
  }

  // Map parsed fields to CreateTaskInput
  if (parsed.project) {
    input.project = parsed.project;
  }

  if (parsed.date) {
    input.deadline = parsed.date;
  }

  if (parsed.duration) {
    input.estimate_minutes = parsed.duration;
  }

  if (parsed.dependencies && parsed.dependencies.length > 0) {
    input.dependencies = parsed.dependencies;
  }

  if (parsed.window) {
    input.window_start = parsed.window.start;
    input.window_end = parsed.window.end;
  }

  if (parsed.recurrence) {
    // Map task-parser RecurrencePattern to churn RecurrencePattern
    input.recurrence_pattern = {
      mode: parsed.recurrence.mode as RecurrenceMode,
      type: parsed.recurrence.type as RecurrenceType,
      interval: parsed.recurrence.interval,
      unit: parsed.recurrence.unit,
      dayOfWeek: parsed.recurrence.dayOfWeek,
      daysOfWeek: parsed.recurrence.daysOfWeek,
      timeOfDay: parsed.recurrence.timeOfDay,
      anchor: parsed.recurrence.anchor,
    };
  }

  // Apply curve options from CLI flags
  if (options.curve) {
    input.curve_config = {
      type: options.curve as CurveType,
    };
    if (options.curve === 'exponential' && options.exponent) {
      input.curve_config.exponent = options.exponent;
    }
  }

  return {
    input,
    bucketName: parsed.bucket,
  };
}

function parseDate(input: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(input + 'T00:00:00');
  }

  const lower = input.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lower === 'today') return today;
  if (lower === 'tomorrow') {
    today.setDate(today.getDate() + 1);
    return today;
  }

  // Try parsing as date
  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  return parsed;
}

function parseDuration(input: string): number {
  const match = input.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!match) {
    throw new Error(`Invalid duration: ${input}`);
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  return hours * 60 + minutes;
}
