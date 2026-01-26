import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database } from '../../src/core/database';
import { TaskService } from '../../src/core/task-service';
import {
  TaskStatus,
  CurveType,
  RecurrenceMode,
  RecurrenceType,
} from '../../src/core/types';

describe('TaskService', () => {
  let db: Database;
  let service: TaskService;
  let dbPath: string;

  beforeEach(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = new Database(dbPath);
    await db.init();
    service = new TaskService(db);
  });

  afterEach(async () => {
    await db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  describe('CRUD operations', () => {
    test('creates a task', async () => {
      const task = await service.create({
        title: 'Test task',
        project: 'test',
        tags: ['urgent'],
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test task');
      expect(task.project).toBe('test');
      expect(task.tags).toEqual(['urgent']);
      expect(task.status).toBe(TaskStatus.OPEN);
    });

    test('gets a task by id', async () => {
      const created = await service.create({ title: 'Test task' });
      const task = await service.get(created.id);

      expect(task).not.toBeNull();
      expect(task!.id).toBe(created.id);
    });

    test('returns null for non-existent task', async () => {
      const task = await service.get(99999);
      expect(task).toBeNull();
    });

    test('lists tasks with filter', async () => {
      await service.create({ title: 'Task 1', project: 'a' });
      await service.create({ title: 'Task 2', project: 'b' });
      await service.create({ title: 'Task 3', project: 'a' });

      const tasks = await service.list({ project: 'a' });
      expect(tasks).toHaveLength(2);
    });

    test('updates a task', async () => {
      const task = await service.create({ title: 'Original' });
      const updated = await service.update(task.id, {
        title: 'Updated',
        status: TaskStatus.IN_PROGRESS,
      });

      expect(updated.title).toBe('Updated');
      expect(updated.status).toBe(TaskStatus.IN_PROGRESS);
    });

    test('deletes a task', async () => {
      const task = await service.create({ title: 'To delete' });
      await service.delete(task.id);

      const result = await service.get(task.id);
      expect(result).toBeNull();
    });

    test('prevents deletion of task with dependents', async () => {
      const dep = await service.create({ title: 'Dependency' });
      await service.create({
        title: 'Dependent',
        dependencies: [dep.id],
      });

      await expect(service.delete(dep.id)).rejects.toThrow('depend on it');
    });
  });

  describe('status management', () => {
    test('completes a one-time task', async () => {
      const task = await service.create({ title: 'One-time task' });
      await service.complete(task.id);

      const updated = await service.get(task.id);
      expect(updated!.status).toBe(TaskStatus.COMPLETED);
      expect(updated!.last_completed_at).toBeDefined();
    });

    test('completes a recurring task and calculates next due', async () => {
      const task = await service.create({
        title: 'Weekly task',
        recurrence_pattern: {
          mode: RecurrenceMode.COMPLETION,
          type: RecurrenceType.WEEKLY,
        },
      });

      const completedAt = new Date('2025-01-10T12:00:00Z');
      await service.complete(task.id, completedAt);

      const updated = await service.get(task.id);
      expect(updated!.status).toBe(TaskStatus.OPEN);
      expect(updated!.last_completed_at).toEqual(completedAt);
      expect(updated!.next_due_at).toBeDefined();

      // Should be 7 days later for weekly completion mode
      const expectedNext = new Date('2025-01-17T12:00:00Z');
      expect(updated!.next_due_at!.getTime()).toBe(expectedNext.getTime());
    });

    test('reopens a completed task', async () => {
      const task = await service.create({ title: 'Task' });
      await service.complete(task.id);
      await service.reopen(task.id);

      const updated = await service.get(task.id);
      expect(updated!.status).toBe(TaskStatus.OPEN);
    });
  });

  describe('queries', () => {
    test('searches tasks', async () => {
      await service.create({ title: 'Deploy application' });
      await service.create({ title: 'Write tests' });
      await service.create({ title: 'Deploy staging' });

      const results = await service.search('deploy*');
      expect(results).toHaveLength(2);
    });

    test('gets dependencies of a task', async () => {
      const dep1 = await service.create({ title: 'Dep 1' });
      const dep2 = await service.create({ title: 'Dep 2' });
      const task = await service.create({
        title: 'Main task',
        dependencies: [dep1.id, dep2.id],
      });

      const deps = await service.getDependencies(task.id);
      expect(deps).toHaveLength(2);
      expect(deps.map((d) => d.id)).toContain(dep1.id);
      expect(deps.map((d) => d.id)).toContain(dep2.id);
    });

    test('gets dependents of a task', async () => {
      const dep = await service.create({ title: 'Dependency' });
      const task1 = await service.create({
        title: 'Task 1',
        dependencies: [dep.id],
      });
      const task2 = await service.create({
        title: 'Task 2',
        dependencies: [dep.id],
      });

      const dependents = await service.getDependents(dep.id);
      expect(dependents).toHaveLength(2);
      expect(dependents.map((t) => t.id)).toContain(task1.id);
      expect(dependents.map((t) => t.id)).toContain(task2.id);
    });

    test('gets recurring tasks', async () => {
      await service.create({ title: 'One-time' });
      await service.create({
        title: 'Recurring',
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.DAILY,
        },
      });

      const recurring = await service.getRecurring();
      expect(recurring).toHaveLength(1);
      expect(recurring[0].title).toBe('Recurring');
    });

    test('gets blocked tasks', async () => {
      const dep = await service.create({ title: 'Dependency' });
      await service.create({
        title: 'Blocked task',
        dependencies: [dep.id],
      });
      await service.create({ title: 'Unblocked task' });

      const blocked = await service.getBlocked();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].title).toBe('Blocked task');
    });
  });

  describe('dependency validation', () => {
    test('validates dependencies exist', async () => {
      await expect(
        service.create({
          title: 'Task',
          dependencies: [99999],
        })
      ).rejects.toThrow('not found');
    });

    test('detects circular dependencies on update', async () => {
      const task1 = await service.create({ title: 'Task 1' });
      const task2 = await service.create({
        title: 'Task 2',
        dependencies: [task1.id],
      });

      await expect(
        service.update(task1.id, { dependencies: [task2.id] })
      ).rejects.toThrow('Circular dependency');
    });
  });

  describe('priority calculation', () => {
    test('calculates priority for task with linear curve', async () => {
      const startDate = new Date('2025-01-01T00:00:00Z');
      const deadline = new Date('2025-01-10T00:00:00Z');

      const task = await service.create({
        title: 'Task',
        curve_config: {
          type: CurveType.LINEAR,
          start_date: startDate,
          deadline: deadline,
        },
      });

      // Midpoint should be ~0.5
      const midpoint = new Date('2025-01-05T12:00:00Z');
      const priority = await service.calculatePriority(task.id, midpoint);
      expect(priority).toBeCloseTo(0.5, 1);
    });

    test('blocked task has zero priority', async () => {
      const dep = await service.create({ title: 'Dependency' });
      const task = await service.create({
        title: 'Blocked',
        dependencies: [dep.id],
      });

      const priority = await service.calculatePriority(task.id);
      expect(priority).toBe(0);
    });

    test('unblocked task has non-zero priority', async () => {
      const dep = await service.create({ title: 'Dependency' });
      await service.complete(dep.id);

      const task = await service.create({
        title: 'Was blocked',
        dependencies: [dep.id],
      });

      const priority = await service.calculatePriority(task.id);
      expect(priority).toBeGreaterThan(0);
    });

    test('task outside time window has zero priority', async () => {
      const task = await service.create({
        title: 'Evening task',
        window_start: '18:00',
        window_end: '22:00',
      });

      // Create a date at 10:00 AM local time
      const morning = new Date();
      morning.setHours(10, 0, 0, 0);
      const priority = await service.calculatePriority(task.id, morning);
      expect(priority).toBe(0);
    });

    test('task inside time window has priority', async () => {
      const task = await service.create({
        title: 'Evening task',
        window_start: '18:00',
        window_end: '22:00',
      });

      // Create a date at 8:00 PM local time
      const evening = new Date();
      evening.setHours(20, 0, 0, 0);
      const priority = await service.calculatePriority(task.id, evening);
      expect(priority).toBeGreaterThan(0);
    });

    test('getByPriority returns tasks sorted by priority', async () => {
      const now = new Date('2025-01-05T00:00:00Z');

      // Task due soon (high priority)
      await service.create({
        title: 'Urgent',
        curve_config: {
          type: CurveType.LINEAR,
          start_date: new Date('2025-01-01'),
          deadline: new Date('2025-01-06'),
        },
      });

      // Task due later (low priority)
      await service.create({
        title: 'Later',
        curve_config: {
          type: CurveType.LINEAR,
          start_date: new Date('2025-01-01'),
          deadline: new Date('2025-01-20'),
        },
      });

      const tasks = await service.getByPriority(10, now);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe('Urgent');
      expect(tasks[1].title).toBe('Later');
      expect(tasks[0].priority).toBeGreaterThan(tasks[1].priority);
    });

    test('getByPriority respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({ title: `Task ${i}` });
      }

      const tasks = await service.getByPriority(3);
      expect(tasks).toHaveLength(3);
    });

    test('getByPriority excludes completed tasks', async () => {
      const task = await service.create({ title: 'Completed' });
      await service.complete(task.id);
      await service.create({ title: 'Open' });

      const tasks = await service.getByPriority();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Open');
    });
  });

  describe('recurrence', () => {
    test('calculates next due for daily calendar recurrence', async () => {
      const task = await service.create({
        title: 'Daily standup',
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.DAILY,
        },
      });

      await service.complete(task.id, new Date('2025-01-10T09:00:00Z'));

      const updated = await service.get(task.id);
      expect(updated!.next_due_at!.getDate()).toBe(11);
    });

    test('calculates next due for weekly calendar recurrence', async () => {
      const task = await service.create({
        title: 'Monday meeting',
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.WEEKLY,
          dayOfWeek: 1, // Monday
        },
      });

      // Complete on Wednesday Jan 8
      await service.complete(task.id, new Date('2025-01-08T10:00:00Z'));

      const updated = await service.get(task.id);
      // Next Monday should be Jan 13
      expect(updated!.next_due_at!.getDate()).toBe(13);
    });

    test('calculates next due for completion-based interval', async () => {
      const task = await service.create({
        title: 'Haircut',
        recurrence_pattern: {
          mode: RecurrenceMode.COMPLETION,
          type: RecurrenceType.INTERVAL,
          interval: 2,
          unit: 'weeks',
        },
      });

      await service.complete(task.id, new Date('2025-01-10T12:00:00Z'));

      const updated = await service.get(task.id);
      // Should be 14 days later
      expect(updated!.next_due_at!.getTime()).toBe(
        new Date('2025-01-24T12:00:00Z').getTime()
      );
    });
  });
});
