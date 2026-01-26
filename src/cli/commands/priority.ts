import { Command } from 'commander';
import { getContext } from '../context';
import { error, formatPriority, formatDate, priorityColor, resetColor } from '../format';

export function registerPriorityCommand(program: Command): void {
  // priority command
  program
    .command('priority')
    .alias('pri')
    .description('Show tasks by current priority')
    .option('--limit <n>', 'Number of tasks to show', parseInt, 10)
    .option('--at <datetime>', 'Calculate priority at specific time')
    .action(async (options) => {
      await showPriority(options, program.opts());
    });

  // timeline command
  program
    .command('timeline <id>')
    .description('Show priority timeline for a task')
    .option('--from <date>', 'Start date')
    .option('--to <date>', 'End date')
    .action(async (id: string, options) => {
      await showTimeline(parseInt(id, 10), options, program.opts());
    });
}

async function showPriority(
  options: { limit?: number; at?: string },
  globalOpts: { verbose?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const datetime = options.at ? new Date(options.at) : new Date();
    const tasks = await ctx.tasks.getByPriority(options.limit ?? 10, datetime);

    if (tasks.length === 0) {
      console.log('No open tasks.');
      return;
    }

    console.log('Top priorities right now:');
    console.log('');

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const color = priorityColor(task.priority);
      const reset = resetColor();

      let details = '';
      if (task.project) {
        details += `@${task.project}`;
      }
      if (task.deadline) {
        if (details) details += ', ';
        details += `due ${formatDate(task.deadline)}`;
      } else if (task.next_due_at) {
        if (details) details += ', ';
        details += `due ${formatDate(task.next_due_at)}`;
      }
      if (task.window_start && task.window_end) {
        if (details) details += ', ';
        details += `window ${task.window_start}-${task.window_end}`;
      }

      const detailStr = details ? ` (${details})` : '';
      console.log(
        `${String(i + 1).padStart(2)}. ${color}[${formatPriority(task.priority)}]${reset} ${task.title}${detailStr}`
      );
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function showTimeline(
  id: number,
  options: { from?: string; to?: string },
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

    // Determine date range
    const now = new Date();
    let fromDate = options.from ? new Date(options.from) : new Date(now);
    fromDate.setHours(0, 0, 0, 0);

    let toDate: Date;
    if (options.to) {
      toDate = new Date(options.to);
    } else if (task.deadline) {
      toDate = new Date(task.deadline.getTime() + 3 * 86400000); // deadline + 3 days
    } else if (task.curve_config.deadline) {
      toDate = new Date(task.curve_config.deadline.getTime() + 3 * 86400000);
    } else {
      toDate = new Date(now.getTime() + 14 * 86400000); // 2 weeks
    }

    console.log(`Priority timeline for Task #${task.id}: ${task.title}`);
    console.log('');
    console.log('Date         Time    Priority  Status');
    console.log('----------   -----   --------  --------');

    // Generate timeline points
    const msPerDay = 86400000;
    const totalDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / msPerDay);
    const step = Math.max(1, Math.floor(totalDays / 10)); // ~10 points

    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + step * msPerDay)) {
      const checkTime = new Date(d);
      checkTime.setHours(9, 0, 0, 0); // 9 AM

      const priority = await ctx.tasks.calculatePriority(id, checkTime);
      const status = getStatusLabel(priority);
      const color = priorityColor(priority);
      const reset = resetColor();

      const dateStr = checkTime.toISOString().split('T')[0];
      const timeStr = '09:00';

      console.log(
        `${dateStr}   ${timeStr}   ${color}${formatPriority(priority).padStart(8)}${reset}  ${status}`
      );
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function getStatusLabel(priority: number): string {
  if (priority === 0) return 'Inactive';
  if (priority >= 1.2) return 'Overdue!';
  if (priority >= 1.0) return 'Due now';
  if (priority >= 0.8) return 'High';
  if (priority >= 0.5) return 'Medium';
  if (priority >= 0.2) return 'Low';
  return 'Just started';
}
