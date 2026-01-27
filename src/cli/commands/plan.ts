import { Command } from 'commander';
import { getContext } from '../context';
import {
  error,
  formatPriority,
  formatDuration,
  priorityColor,
  resetColor,
  padRight,
  padLeft,
  truncate,
} from '../format';
import { DailyPlanner, DailyPlan, ScheduledTask, PlannerConfig } from '../../core/planner';

export function registerPlanCommands(program: Command): void {
  program
    .command('plan')
    .alias('today')
    .description('Generate a daily plan for today (or specified date)')
    .option('--date <date>', 'Plan for a specific date (default: today)')
    .option('--limit <n>', 'Maximum tasks to schedule', parseInt, 8)
    .option('--start <HH:MM>', 'Work hours start time', '08:00')
    .option('--end <HH:MM>', 'Work hours end time', '17:00')
    .option('--no-slots', 'Show prioritized list without time slots')
    .action(async (options) => {
      await showPlan(options, program.opts());
    });
}

async function showPlan(
  options: {
    date?: string;
    limit?: number;
    start?: string;
    end?: string;
    slots?: boolean;
  },
  globalOpts: { verbose?: boolean; json?: boolean; config?: string; db?: string }
): Promise<void> {
  try {
    const ctx = await getContext({
      configPath: globalOpts.config,
      dbPath: globalOpts.db,
      verbose: globalOpts.verbose,
    });

    const date = options.date ? new Date(options.date) : new Date();
    date.setHours(0, 0, 0, 0);

    const config: Partial<PlannerConfig> = {
      workHoursStart: options.start,
      workHoursEnd: options.end,
    };

    const planner = new DailyPlanner(config);
    const plan = await planner.planDay(ctx.tasks, date, {
      limit: options.limit,
      includeTimeBlocks: options.slots !== false,
    });

    if (globalOpts.json) {
      console.log(JSON.stringify(planToJson(plan), null, 2));
      return;
    }

    printPlan(plan, options.slots !== false);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function planToJson(plan: DailyPlan): object {
  return {
    date: plan.date.toISOString().split('T')[0],
    workHours: plan.workHours,
    scheduled: plan.scheduled.map((s) => ({
      id: s.task.id,
      title: s.task.title,
      project: s.task.project,
      priority: s.task.priority,
      slot: s.slot,
      estimateMinutes: s.estimateMinutes,
      isDefaultEstimate: s.isDefaultEstimate,
    })),
    unscheduled: plan.unscheduled.map((u) => ({
      id: u.task.id,
      title: u.task.title,
      reason: u.reason,
    })),
    totalScheduledMinutes: plan.totalScheduledMinutes,
    remainingMinutes: plan.remainingMinutes,
  };
}

function printPlan(plan: DailyPlan, showSlots: boolean): void {
  const dateStr = plan.date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  console.log(`Daily Plan: ${dateStr}`);
  console.log(`Work hours: ${plan.workHours.start} - ${plan.workHours.end}`);
  console.log('');

  if (plan.scheduled.length === 0) {
    console.log('No tasks scheduled.');
    return;
  }

  if (showSlots) {
    printScheduledWithSlots(plan.scheduled);
  } else {
    printScheduledList(plan.scheduled);
  }

  console.log('');
  console.log(
    `Total: ${formatDuration(plan.totalScheduledMinutes)} scheduled, ${formatDuration(plan.remainingMinutes)} remaining`
  );

  if (plan.unscheduled.length > 0) {
    console.log('');
    console.log('Could not schedule:');
    for (const item of plan.unscheduled) {
      console.log(`  - #${item.task.id} ${item.task.title} (${item.reason})`);
    }
  }
}

function printScheduledWithSlots(scheduled: ScheduledTask[]): void {
  console.log('Time        ID    Pri    Est   Task');
  console.log('----------  ----  -----  ----  ------------------------------');

  for (const item of scheduled) {
    const timeSlot = `${item.slot.start}-${item.slot.end}`;
    const id = padLeft(String(item.task.id), 4);
    const color = priorityColor(item.task.priority);
    const reset = resetColor();
    const priority = formatPriority(item.task.priority);
    const estimate = formatDuration(item.estimateMinutes) + (item.isDefaultEstimate ? '?' : '');
    const title = truncate(item.task.title, 30);

    console.log(
      `${timeSlot}  ${id}  ${color}${padLeft(priority, 5)}${reset}  ${padRight(estimate, 4)}  ${title}`
    );
  }
}

function printScheduledList(scheduled: ScheduledTask[]): void {
  console.log('  #  ID    Pri    Est   Task');
  console.log('---  ----  -----  ----  ------------------------------');

  for (let i = 0; i < scheduled.length; i++) {
    const item = scheduled[i];
    const num = padLeft(String(i + 1), 3);
    const id = padLeft(String(item.task.id), 4);
    const color = priorityColor(item.task.priority);
    const reset = resetColor();
    const priority = formatPriority(item.task.priority);
    const estimate = formatDuration(item.estimateMinutes) + (item.isDefaultEstimate ? '?' : '');
    const title = truncate(item.task.title, 30);

    console.log(
      `${num}  ${id}  ${color}${padLeft(priority, 5)}${reset}  ${padRight(estimate, 4)}  ${title}`
    );
  }
}
