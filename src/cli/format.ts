import { Task, Bucket, TaskStatus } from '../core';

export interface TaskWithPriority extends Task {
  priority: number;
}

export function formatDate(date: Date | undefined): string {
  if (!date) return '-';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return 'Today';
  }
  if (dateOnly.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  // Within 7 days, show day name
  const daysAway = (dateOnly.getTime() - today.getTime()) / 86400000;
  if (daysAway > 0 && daysAway < 7) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }

  // Otherwise show date
  const month = date.toLocaleString('en', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

export function formatDuration(minutes: number | undefined): string {
  if (!minutes) return '-';

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h${mins}m`;
}

export function formatPriority(priority: number): string {
  return priority.toFixed(2);
}

export function formatStatus(status: TaskStatus): string {
  const statusMap: Record<TaskStatus, string> = {
    [TaskStatus.OPEN]: 'open',
    [TaskStatus.IN_PROGRESS]: 'progress',
    [TaskStatus.COMPLETED]: 'done',
    [TaskStatus.BLOCKED]: 'blocked',
  };
  return statusMap[status] ?? status;
}

export function priorityColor(priority: number): string {
  if (priority >= 1.0) return '\x1b[31m'; // Red - overdue
  if (priority >= 0.8) return '\x1b[33m'; // Yellow - high
  if (priority >= 0.5) return '\x1b[0m';  // Normal - medium
  return '\x1b[90m';                       // Gray - low
}

export function resetColor(): string {
  return '\x1b[0m';
}

export function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

export function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}

export function formatTaskRow(task: Task | TaskWithPriority, showPriority = false): string {
  const id = padLeft(String(task.id), 4);
  const priority = 'priority' in task ? formatPriority(task.priority) : '-';
  const status = padRight(formatStatus(task.status), 8);
  const title = truncate(task.title, 30);
  const project = task.project ? `@${task.project}` : '-';
  const due = formatDate(task.deadline ?? task.next_due_at);

  if (showPriority) {
    const color = 'priority' in task ? priorityColor(task.priority) : '';
    const reset = resetColor();
    return `${id}  ${color}${padLeft(priority, 5)}${reset}  ${status}  ${padRight(title, 30)}  ${padRight(project, 12)}  ${due}`;
  }

  return `${id}  ${status}  ${padRight(title, 30)}  ${padRight(project, 12)}  ${due}`;
}

export function formatTaskTable(tasks: (Task | TaskWithPriority)[], showPriority = false): string {
  if (tasks.length === 0) {
    return 'No tasks found.';
  }

  const lines: string[] = [];

  // Header
  if (showPriority) {
    lines.push(`  ID    Pri  Status    Title                           Project       Due`);
    lines.push(`----  -----  --------  ------------------------------  ------------  ----------`);
  } else {
    lines.push(`  ID  Status    Title                           Project       Due`);
    lines.push(`----  --------  ------------------------------  ------------  ----------`);
  }

  // Rows
  for (const task of tasks) {
    lines.push(formatTaskRow(task, showPriority));
  }

  return lines.join('\n');
}

export function formatBucketRow(bucket: Bucket, taskCount: number): string {
  const id = padLeft(String(bucket.id), 4);
  const name = padRight(bucket.name, 20);
  const type = padRight(bucket.type, 10);
  const count = padLeft(String(taskCount), 5);

  return `${id}  ${name}  ${type}  ${count}`;
}

export function formatBucketTable(buckets: Array<{ bucket: Bucket; taskCount: number }>): string {
  if (buckets.length === 0) {
    return 'No buckets found.';
  }

  const lines: string[] = [];

  // Header
  lines.push(`  ID  Name                  Type        Tasks`);
  lines.push(`----  --------------------  ----------  -----`);

  // Rows
  for (const { bucket, taskCount } of buckets) {
    lines.push(formatBucketRow(bucket, taskCount));
  }

  return lines.join('\n');
}

export function formatTaskDetail(task: Task, priority: number, deps: Task[], dependents: Task[]): string {
  const lines: string[] = [];

  lines.push(`Task #${task.id}: ${task.title}`);
  lines.push('');

  if (task.project) {
    lines.push(`Project: ${task.project}`);
  }

  if (task.tags.length > 0) {
    lines.push(`Tags: ${task.tags.join(', ')}`);
  }

  lines.push(`Status: ${task.status}`);

  if (task.bucket_id) {
    lines.push(`Bucket: #${task.bucket_id}`);
  }

  lines.push('');
  lines.push('Timeline:');
  lines.push(`  Created: ${task.created_at.toISOString().split('T')[0]}`);

  if (task.deadline) {
    lines.push(`  Deadline: ${task.deadline.toISOString().split('T')[0]}`);
  }

  if (task.estimate_minutes) {
    lines.push(`  Estimate: ${formatDuration(task.estimate_minutes)}`);
  }

  lines.push('');
  lines.push(`Priority Curve: ${task.curve_config.type}`);
  lines.push(`  Current Priority: ${formatPriority(priority)} (${getPriorityLevel(priority)})`);

  if (task.curve_config.start_date) {
    lines.push(`  Start: ${task.curve_config.start_date.toISOString().split('T')[0]}`);
  }

  if (task.curve_config.deadline) {
    lines.push(`  Deadline: ${task.curve_config.deadline.toISOString().split('T')[0]}`);
  }

  lines.push('');

  if (deps.length > 0) {
    lines.push(`Dependencies: ${deps.map(d => `#${d.id} (${d.title})`).join(', ')}`);
  } else {
    lines.push('Dependencies: None');
  }

  if (dependents.length > 0) {
    lines.push(`Dependents: ${dependents.map(d => `#${d.id} (${d.title})`).join(', ')}`);
  } else {
    lines.push('Dependents: None');
  }

  if (task.recurrence_pattern) {
    lines.push('');
    lines.push(`Recurrence: ${formatRecurrence(task)}`);
    if (task.next_due_at) {
      lines.push(`Next due: ${task.next_due_at.toISOString().split('T')[0]}`);
    }
    if (task.last_completed_at) {
      lines.push(`Last completed: ${task.last_completed_at.toISOString().split('T')[0]}`);
    }
  }

  return lines.join('\n');
}

function getPriorityLevel(priority: number): string {
  if (priority >= 1.0) return 'overdue';
  if (priority >= 0.8) return 'high';
  if (priority >= 0.5) return 'medium';
  if (priority >= 0.2) return 'low';
  return 'inactive';
}

function formatRecurrence(task: Task): string {
  const pattern = task.recurrence_pattern;
  if (!pattern) return 'none';

  const timeSuffix = pattern.timeOfDay ? ` at ${pattern.timeOfDay}` : '';

  if (pattern.mode === 'calendar') {
    if (pattern.type === 'daily') return `daily${timeSuffix}`;
    if (pattern.type === 'weekly' && pattern.dayOfWeek !== undefined) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return `every ${days[pattern.dayOfWeek]}${timeSuffix}`;
    }
    if (pattern.type === 'monthly') return `monthly${timeSuffix}`;
    if (pattern.type === 'interval' && pattern.interval && pattern.unit) {
      return `every ${pattern.interval} ${pattern.unit}${timeSuffix}`;
    }
  } else {
    if (pattern.type === 'interval' && pattern.interval && pattern.unit) {
      return `after ${pattern.interval} ${pattern.unit}${timeSuffix}`;
    }
  }

  return pattern.type;
}

export function success(message: string): void {
  console.log(`✓ ${message}`);
}

export function error(message: string): void {
  console.error(`Error: ${message}`);
}

export function warn(message: string): void {
  console.warn(`Warning: ${message}`);
}
