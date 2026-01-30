import {
  formatDate,
  formatDuration,
  formatPriority,
  formatStatus,
  priorityColor,
  resetColor,
  padRight,
  padLeft,
  truncate,
  formatTaskRow,
  formatTaskTable,
  formatBucketRow,
  formatBucketTable,
  formatTaskDetail,
  success,
  error,
  warn,
} from '../../src/cli/format';
import { TaskStatus, Task, Bucket, RecurrenceMode, RecurrenceType, CurveType } from '@kevjava/churn-core';

describe('format utilities', () => {
  describe('formatDate', () => {
    it('returns "-" for undefined date', () => {
      expect(formatDate(undefined)).toBe('-');
    });

    it('returns "Today" for today\'s date', () => {
      const today = new Date();
      expect(formatDate(today)).toBe('Today');
    });

    it('returns "Tomorrow" for tomorrow\'s date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(formatDate(tomorrow)).toBe('Tomorrow');
    });

    it('returns day name for dates within 7 days', () => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const inThreeDays = new Date();
      inThreeDays.setDate(inThreeDays.getDate() + 3);
      expect(days).toContain(formatDate(inThreeDays));
    });

    it('returns month and day for dates beyond 7 days', () => {
      const farDate = new Date();
      farDate.setDate(farDate.getDate() + 14);
      const result = formatDate(farDate);
      expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    });

    it('returns month and day for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);
      const result = formatDate(pastDate);
      expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    });
  });

  describe('formatDuration', () => {
    it('returns "-" for undefined', () => {
      expect(formatDuration(undefined)).toBe('-');
    });

    it('returns "-" for zero minutes', () => {
      expect(formatDuration(0)).toBe('-');
    });

    it('formats minutes only', () => {
      expect(formatDuration(30)).toBe('30m');
      expect(formatDuration(45)).toBe('45m');
    });

    it('formats hours only', () => {
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(120)).toBe('2h');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h30m');
      expect(formatDuration(150)).toBe('2h30m');
    });
  });

  describe('formatPriority', () => {
    it('formats priority to 2 decimal places', () => {
      expect(formatPriority(0)).toBe('0.00');
      expect(formatPriority(0.5)).toBe('0.50');
      expect(formatPriority(1.0)).toBe('1.00');
      expect(formatPriority(0.123)).toBe('0.12');
      expect(formatPriority(0.999)).toBe('1.00');
    });
  });

  describe('formatStatus', () => {
    it('formats OPEN status', () => {
      expect(formatStatus(TaskStatus.OPEN)).toBe('open');
    });

    it('formats IN_PROGRESS status', () => {
      expect(formatStatus(TaskStatus.IN_PROGRESS)).toBe('progress');
    });

    it('formats COMPLETED status', () => {
      expect(formatStatus(TaskStatus.COMPLETED)).toBe('done');
    });

    it('formats BLOCKED status', () => {
      expect(formatStatus(TaskStatus.BLOCKED)).toBe('blocked');
    });
  });

  describe('priorityColor', () => {
    it('returns red for overdue (>= 1.0)', () => {
      expect(priorityColor(1.0)).toBe('\x1b[31m');
      expect(priorityColor(1.5)).toBe('\x1b[31m');
    });

    it('returns yellow for high (>= 0.8)', () => {
      expect(priorityColor(0.8)).toBe('\x1b[33m');
      expect(priorityColor(0.9)).toBe('\x1b[33m');
    });

    it('returns normal for medium (>= 0.5)', () => {
      expect(priorityColor(0.5)).toBe('\x1b[0m');
      expect(priorityColor(0.7)).toBe('\x1b[0m');
    });

    it('returns gray for low (< 0.5)', () => {
      expect(priorityColor(0.4)).toBe('\x1b[90m');
      expect(priorityColor(0)).toBe('\x1b[90m');
    });
  });

  describe('resetColor', () => {
    it('returns ANSI reset code', () => {
      expect(resetColor()).toBe('\x1b[0m');
    });
  });

  describe('padRight', () => {
    it('pads short strings', () => {
      expect(padRight('abc', 6)).toBe('abc   ');
    });

    it('truncates long strings', () => {
      expect(padRight('abcdef', 4)).toBe('abcd');
    });

    it('returns unchanged if exact length', () => {
      expect(padRight('abcd', 4)).toBe('abcd');
    });
  });

  describe('padLeft', () => {
    it('pads short strings', () => {
      expect(padLeft('abc', 6)).toBe('   abc');
    });

    it('truncates long strings', () => {
      expect(padLeft('abcdef', 4)).toBe('abcd');
    });

    it('returns unchanged if exact length', () => {
      expect(padLeft('abcd', 4)).toBe('abcd');
    });
  });

  describe('truncate', () => {
    it('returns short strings unchanged', () => {
      expect(truncate('abc', 10)).toBe('abc');
    });

    it('truncates and adds ellipsis', () => {
      expect(truncate('abcdefghij', 6)).toBe('abcde…');
    });

    it('returns unchanged if exact length', () => {
      expect(truncate('abcd', 4)).toBe('abcd');
    });
  });

  describe('formatTaskRow', () => {
    const baseTask: Task = {
      id: 1,
      title: 'Test task',
      project: 'myproject',
      tags: [],
      dependencies: [],
      status: TaskStatus.OPEN,
      created_at: new Date(),
      updated_at: new Date(),
      curve_config: { type: CurveType.LINEAR },
    };

    it('formats task without priority', () => {
      const row = formatTaskRow(baseTask, false);
      expect(row).toContain('1');
      expect(row).toContain('open');
      expect(row).toContain('Test task');
      expect(row).toContain('@myproject');
    });

    it('formats task with priority', () => {
      const taskWithPriority = { ...baseTask, priority: 0.75 };
      const row = formatTaskRow(taskWithPriority, true);
      expect(row).toContain('0.75');
    });

    it('shows deadline date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const taskWithDeadline = { ...baseTask, deadline: tomorrow };
      const row = formatTaskRow(taskWithDeadline, false);
      expect(row).toContain('Tomorrow');
    });

    it('shows next_due_at when no deadline', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const taskWithNextDue = { ...baseTask, next_due_at: tomorrow };
      const row = formatTaskRow(taskWithNextDue, false);
      expect(row).toContain('Tomorrow');
    });

    it('shows "-" for project when not set', () => {
      const taskNoProject = { ...baseTask, project: undefined };
      const row = formatTaskRow(taskNoProject, false);
      expect(row).toMatch(/\s-\s/);
    });
  });

  describe('formatTaskTable', () => {
    const baseTask: Task = {
      id: 1,
      title: 'Test task',
      tags: [],
      dependencies: [],
      status: TaskStatus.OPEN,
      created_at: new Date(),
      updated_at: new Date(),
      curve_config: { type: CurveType.LINEAR },
    };

    it('returns message for empty array', () => {
      expect(formatTaskTable([], false)).toBe('No tasks found.');
    });

    it('includes header without priority column', () => {
      const table = formatTaskTable([baseTask], false);
      expect(table).toContain('ID');
      expect(table).toContain('Status');
      expect(table).toContain('Title');
      expect(table).not.toContain('Pri');
    });

    it('includes header with priority column', () => {
      const taskWithPriority = { ...baseTask, priority: 0.5 };
      const table = formatTaskTable([taskWithPriority], true);
      expect(table).toContain('Pri');
    });

    it('includes multiple tasks', () => {
      const tasks = [
        { ...baseTask, id: 1, title: 'Task 1' },
        { ...baseTask, id: 2, title: 'Task 2' },
      ];
      const table = formatTaskTable(tasks, false);
      expect(table).toContain('Task 1');
      expect(table).toContain('Task 2');
    });
  });

  describe('formatBucketRow', () => {
    const bucket: Bucket = {
      id: 1,
      name: 'MyBucket',
      type: 'project',
      config: {},
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('formats bucket with task count', () => {
      const row = formatBucketRow(bucket, 5);
      expect(row).toContain('1');
      expect(row).toContain('MyBucket');
      expect(row).toContain('project');
      expect(row).toContain('5');
    });
  });

  describe('formatBucketTable', () => {
    const bucket: Bucket = {
      id: 1,
      name: 'MyBucket',
      type: 'project',
      config: {},
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('returns message for empty array', () => {
      expect(formatBucketTable([])).toBe('No buckets found.');
    });

    it('includes header', () => {
      const table = formatBucketTable([{ bucket, taskCount: 0 }]);
      expect(table).toContain('ID');
      expect(table).toContain('Name');
      expect(table).toContain('Type');
      expect(table).toContain('Tasks');
    });
  });

  describe('formatTaskDetail', () => {
    const baseTask: Task = {
      id: 1,
      title: 'Test task',
      tags: ['tag1', 'tag2'],
      dependencies: [],
      project: 'myproject',
      status: TaskStatus.OPEN,
      created_at: new Date('2024-01-15'),
      updated_at: new Date(),
      curve_config: { type: CurveType.LINEAR },
    };

    it('includes task id and title', () => {
      const detail = formatTaskDetail(baseTask, 0.5, [], []);
      expect(detail).toContain('Task #1: Test task');
    });

    it('includes project', () => {
      const detail = formatTaskDetail(baseTask, 0.5, [], []);
      expect(detail).toContain('Project: myproject');
    });

    it('includes tags', () => {
      const detail = formatTaskDetail(baseTask, 0.5, [], []);
      expect(detail).toContain('Tags: tag1, tag2');
    });

    it('includes status', () => {
      const detail = formatTaskDetail(baseTask, 0.5, [], []);
      expect(detail).toContain('Status: open');
    });

    it('includes priority with level', () => {
      const detail = formatTaskDetail(baseTask, 0.5, [], []);
      expect(detail).toContain('Current Priority: 0.50 (medium)');
    });

    it('shows overdue priority level', () => {
      const detail = formatTaskDetail(baseTask, 1.2, [], []);
      expect(detail).toContain('(overdue)');
    });

    it('shows high priority level', () => {
      const detail = formatTaskDetail(baseTask, 0.85, [], []);
      expect(detail).toContain('(high)');
    });

    it('shows low priority level', () => {
      const detail = formatTaskDetail(baseTask, 0.25, [], []);
      expect(detail).toContain('(low)');
    });

    it('shows inactive priority level', () => {
      const detail = formatTaskDetail(baseTask, 0.1, [], []);
      expect(detail).toContain('(inactive)');
    });

    it('includes dependencies', () => {
      const dep: Task = { ...baseTask, id: 2, title: 'Dependency' };
      const detail = formatTaskDetail(baseTask, 0.5, [dep], []);
      expect(detail).toContain('Dependencies: #2 (Dependency)');
    });

    it('shows "None" when no dependencies', () => {
      const detail = formatTaskDetail(baseTask, 0.5, [], []);
      expect(detail).toContain('Dependencies: None');
    });

    it('includes dependents', () => {
      const dependent: Task = { ...baseTask, id: 3, title: 'Dependent' };
      const detail = formatTaskDetail(baseTask, 0.5, [], [dependent]);
      expect(detail).toContain('Dependents: #3 (Dependent)');
    });

    it('includes deadline in timeline', () => {
      const taskWithDeadline = { ...baseTask, deadline: new Date('2024-01-20') };
      const detail = formatTaskDetail(taskWithDeadline, 0.5, [], []);
      expect(detail).toContain('Deadline: 2024-01-20');
    });

    it('includes estimate', () => {
      const taskWithEstimate = { ...baseTask, estimate_minutes: 90 };
      const detail = formatTaskDetail(taskWithEstimate, 0.5, [], []);
      expect(detail).toContain('Estimate: 1h30m');
    });

    it('includes bucket id', () => {
      const taskWithBucket = { ...baseTask, bucket_id: 5 };
      const detail = formatTaskDetail(taskWithBucket, 0.5, [], []);
      expect(detail).toContain('Bucket: #5');
    });

    it('includes recurrence info', () => {
      const recurringTask: Task = {
        ...baseTask,
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.DAILY,
        },
        next_due_at: new Date('2024-01-16'),
        last_completed_at: new Date('2024-01-15'),
      };
      const detail = formatTaskDetail(recurringTask, 0.5, [], []);
      expect(detail).toContain('Recurrence: daily');
      expect(detail).toContain('Next due: 2024-01-16');
      expect(detail).toContain('Last completed: 2024-01-15');
    });

    it('formats weekly recurrence with single day', () => {
      const task: Task = {
        ...baseTask,
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.WEEKLY,
          dayOfWeek: 1, // Monday
        },
      };
      const detail = formatTaskDetail(task, 0.5, [], []);
      expect(detail).toContain('every Monday');
    });

    it('formats weekly recurrence with weekdays', () => {
      const task: Task = {
        ...baseTask,
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.WEEKLY,
          daysOfWeek: [1, 2, 3, 4, 5],
        },
      };
      const detail = formatTaskDetail(task, 0.5, [], []);
      expect(detail).toContain('weekdays');
    });

    it('formats weekly recurrence with specific days', () => {
      const task: Task = {
        ...baseTask,
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.WEEKLY,
          daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
        },
      };
      const detail = formatTaskDetail(task, 0.5, [], []);
      expect(detail).toContain('Mon,Wed,Fri');
    });

    it('formats monthly recurrence', () => {
      const task: Task = {
        ...baseTask,
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.MONTHLY,
        },
      };
      const detail = formatTaskDetail(task, 0.5, [], []);
      expect(detail).toContain('monthly');
    });

    it('formats interval recurrence in calendar mode', () => {
      const task: Task = {
        ...baseTask,
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.INTERVAL,
          interval: 2,
          unit: 'weeks',
        },
      };
      const detail = formatTaskDetail(task, 0.5, [], []);
      expect(detail).toContain('every 2 weeks');
    });

    it('formats interval recurrence in completion mode', () => {
      const task: Task = {
        ...baseTask,
        recurrence_pattern: {
          mode: RecurrenceMode.COMPLETION,
          type: RecurrenceType.INTERVAL,
          interval: 3,
          unit: 'days',
        },
      };
      const detail = formatTaskDetail(task, 0.5, [], []);
      expect(detail).toContain('after 3 days');
    });

    it('includes time of day in recurrence', () => {
      const task: Task = {
        ...baseTask,
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.DAILY,
          timeOfDay: '09:00',
        },
      };
      const detail = formatTaskDetail(task, 0.5, [], []);
      expect(detail).toContain('daily at 09:00');
    });
  });

  describe('console output functions', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('success outputs with checkmark', () => {
      success('Task created');
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Task created');
    });

    it('error outputs to stderr', () => {
      error('Something failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Something failed');
    });

    it('warn outputs to stderr', () => {
      warn('Be careful');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning: Be careful');
    });
  });
});
