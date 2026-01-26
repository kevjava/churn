import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database } from '../../src/core/database';
import { TaskStatus, CurveType, RecurrenceMode, RecurrenceType } from '../../src/core/types';

describe('Database', () => {
  let db: Database;
  let dbPath: string;

  beforeEach(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = new Database(dbPath);
    await db.init();
  });

  afterEach(async () => {
    await db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  describe('initialization', () => {
    test('creates database file', () => {
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    test('initializes config with default values', async () => {
      const version = await db.getConfig('version');
      expect(version).toBe('1.0.0');

      const defaults = await db.getConfig('defaults') as Record<string, unknown>;
      expect(defaults.curve_type).toBe('linear');
    });
  });

  describe('task operations', () => {
    test('creates and retrieves a task', async () => {
      const id = await db.insertTask({
        title: 'Test task',
        project: 'test-project',
        tags: ['tag1', 'tag2'],
      });

      const task = await db.getTask(id);
      expect(task).not.toBeNull();
      expect(task!.title).toBe('Test task');
      expect(task!.project).toBe('test-project');
      expect(task!.tags).toEqual(['tag1', 'tag2']);
      expect(task!.status).toBe(TaskStatus.OPEN);
    });

    test('creates task with deadline', async () => {
      const deadline = new Date('2025-01-15T17:00:00Z');
      const id = await db.insertTask({
        title: 'Task with deadline',
        deadline,
      });

      const task = await db.getTask(id);
      expect(task!.deadline).toEqual(deadline);
    });

    test('creates task with estimate', async () => {
      const id = await db.insertTask({
        title: 'Task with estimate',
        estimate_minutes: 120,
      });

      const task = await db.getTask(id);
      expect(task!.estimate_minutes).toBe(120);
    });

    test('creates task with recurrence pattern', async () => {
      const id = await db.insertTask({
        title: 'Recurring task',
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.WEEKLY,
          dayOfWeek: 1,
        },
      });

      const task = await db.getTask(id);
      expect(task!.recurrence_pattern).toMatchObject({
        mode: RecurrenceMode.CALENDAR,
        type: RecurrenceType.WEEKLY,
        dayOfWeek: 1,
      });
    });

    test('creates task with time window', async () => {
      const id = await db.insertTask({
        title: 'Task with window',
        window_start: '18:00',
        window_end: '08:00',
      });

      const task = await db.getTask(id);
      expect(task!.window_start).toBe('18:00');
      expect(task!.window_end).toBe('08:00');
    });

    test('creates task with dependencies', async () => {
      const dep1 = await db.insertTask({ title: 'Dependency 1' });
      const dep2 = await db.insertTask({ title: 'Dependency 2' });

      const id = await db.insertTask({
        title: 'Dependent task',
        dependencies: [dep1, dep2],
      });

      const task = await db.getTask(id);
      expect(task!.dependencies).toEqual([dep1, dep2]);
    });

    test('creates task with custom curve config', async () => {
      const id = await db.insertTask({
        title: 'Task with exponential curve',
        curve_config: {
          type: CurveType.EXPONENTIAL,
          exponent: 2.5,
        },
      });

      const task = await db.getTask(id);
      expect(task!.curve_config.type).toBe(CurveType.EXPONENTIAL);
      expect(task!.curve_config.exponent).toBe(2.5);
    });

    test('updates a task', async () => {
      const id = await db.insertTask({ title: 'Original title' });

      await db.updateTask(id, {
        title: 'Updated title',
        project: 'new-project',
        status: TaskStatus.IN_PROGRESS,
      });

      const task = await db.getTask(id);
      expect(task!.title).toBe('Updated title');
      expect(task!.project).toBe('new-project');
      expect(task!.status).toBe(TaskStatus.IN_PROGRESS);
    });

    test('deletes a task', async () => {
      const id = await db.insertTask({ title: 'To be deleted' });
      await db.deleteTask(id);

      const task = await db.getTask(id);
      expect(task).toBeNull();
    });

    test('returns null for non-existent task', async () => {
      const task = await db.getTask(99999);
      expect(task).toBeNull();
    });

    test('lists all tasks', async () => {
      await db.insertTask({ title: 'Task 1' });
      await db.insertTask({ title: 'Task 2' });
      await db.insertTask({ title: 'Task 3' });

      const tasks = await db.getTasks();
      expect(tasks).toHaveLength(3);
    });

    test('filters tasks by status', async () => {
      await db.insertTask({ title: 'Open task' });
      const inProgressId = await db.insertTask({ title: 'In progress task' });
      await db.updateTask(inProgressId, { status: TaskStatus.IN_PROGRESS });

      const openTasks = await db.getTasks({ status: TaskStatus.OPEN });
      expect(openTasks).toHaveLength(1);
      expect(openTasks[0].title).toBe('Open task');

      const inProgressTasks = await db.getTasks({ status: TaskStatus.IN_PROGRESS });
      expect(inProgressTasks).toHaveLength(1);
      expect(inProgressTasks[0].title).toBe('In progress task');
    });

    test('filters tasks by project', async () => {
      await db.insertTask({ title: 'Task A', project: 'project-a' });
      await db.insertTask({ title: 'Task B', project: 'project-b' });

      const tasks = await db.getTasks({ project: 'project-a' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task A');
    });

    test('filters tasks by tags', async () => {
      await db.insertTask({ title: 'Urgent task', tags: ['urgent', 'important'] });
      await db.insertTask({ title: 'Normal task', tags: ['normal'] });

      const urgentTasks = await db.getTasks({ tags: ['urgent'] });
      expect(urgentTasks).toHaveLength(1);
      expect(urgentTasks[0].title).toBe('Urgent task');
    });

    test('filters tasks with deadline', async () => {
      await db.insertTask({ title: 'Task with deadline', deadline: new Date() });
      await db.insertTask({ title: 'Task without deadline' });

      const tasksWithDeadline = await db.getTasks({ has_deadline: true });
      expect(tasksWithDeadline).toHaveLength(1);
      expect(tasksWithDeadline[0].title).toBe('Task with deadline');

      const tasksWithoutDeadline = await db.getTasks({ has_deadline: false });
      expect(tasksWithoutDeadline).toHaveLength(1);
      expect(tasksWithoutDeadline[0].title).toBe('Task without deadline');
    });

    test('filters recurring tasks', async () => {
      await db.insertTask({
        title: 'Recurring',
        recurrence_pattern: { mode: RecurrenceMode.CALENDAR, type: RecurrenceType.DAILY },
      });
      await db.insertTask({ title: 'One-time' });

      const recurringTasks = await db.getTasks({ has_recurrence: true });
      expect(recurringTasks).toHaveLength(1);
      expect(recurringTasks[0].title).toBe('Recurring');
    });

    test('searches tasks by title', async () => {
      await db.insertTask({ title: 'Deploy application' });
      await db.insertTask({ title: 'Write documentation' });
      await db.insertTask({ title: 'Fix deployment bug' });

      const results = await db.searchTasks('deploy*');
      expect(results).toHaveLength(2);
    });

    test('searches tasks by project', async () => {
      await db.insertTask({ title: 'Task 1', project: 'relay' });
      await db.insertTask({ title: 'Task 2', project: 'churn' });

      const results = await db.searchTasks('relay');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Task 1');
    });
  });

  describe('bucket operations', () => {
    test('creates and retrieves a bucket', async () => {
      const id = await db.insertBucket({
        name: 'ProjectA',
        type: 'project',
      });

      const bucket = await db.getBucket(id);
      expect(bucket).not.toBeNull();
      expect(bucket!.name).toBe('ProjectA');
      expect(bucket!.type).toBe('project');
    });

    test('creates bucket with config', async () => {
      const id = await db.insertBucket({
        name: 'Morning Work',
        type: 'context',
        config: {
          preferred_times: ['mornings'],
          min_block_duration: 60,
          interruptible: false,
        },
      });

      const bucket = await db.getBucket(id);
      expect(bucket!.config.preferred_times).toEqual(['mornings']);
      expect(bucket!.config.min_block_duration).toBe(60);
      expect(bucket!.config.interruptible).toBe(false);
    });

    test('gets bucket by name', async () => {
      await db.insertBucket({ name: 'Admin', type: 'category' });

      const bucket = await db.getBucketByName('Admin');
      expect(bucket).not.toBeNull();
      expect(bucket!.name).toBe('Admin');
    });

    test('lists all buckets', async () => {
      await db.insertBucket({ name: 'Bucket A', type: 'project' });
      await db.insertBucket({ name: 'Bucket B', type: 'category' });

      const buckets = await db.getBuckets();
      expect(buckets).toHaveLength(2);
    });

    test('updates a bucket', async () => {
      const id = await db.insertBucket({ name: 'Old Name', type: 'project' });

      await db.updateBucket(id, { name: 'New Name' });

      const bucket = await db.getBucket(id);
      expect(bucket!.name).toBe('New Name');
    });

    test('deletes a bucket', async () => {
      const id = await db.insertBucket({ name: 'To Delete', type: 'category' });
      await db.deleteBucket(id);

      const bucket = await db.getBucket(id);
      expect(bucket).toBeNull();
    });

    test('task bucket_id is set to null when bucket is deleted', async () => {
      const bucketId = await db.insertBucket({ name: 'Test Bucket', type: 'project' });
      const taskId = await db.insertTask({ title: 'Task', bucket_id: bucketId });

      await db.deleteBucket(bucketId);

      const task = await db.getTask(taskId);
      expect(task!.bucket_id).toBeUndefined();
    });
  });

  describe('completion operations', () => {
    test('creates and retrieves a completion', async () => {
      const taskId = await db.insertTask({ title: 'Test task' });
      const completedAt = new Date();

      const completionId = await db.insertCompletion({
        task_id: taskId,
        completed_at: completedAt,
        actual_minutes: 45,
        scheduled_minutes: 60,
        day_of_week: completedAt.getDay(),
        hour_of_day: completedAt.getHours(),
      });

      const completion = await db.getCompletion(completionId);
      expect(completion).not.toBeNull();
      expect(completion!.task_id).toBe(taskId);
      expect(completion!.actual_minutes).toBe(45);
      expect(completion!.scheduled_minutes).toBe(60);
    });

    test('gets completions for a task', async () => {
      const taskId = await db.insertTask({ title: 'Test task' });
      const now = new Date();

      await db.insertCompletion({
        task_id: taskId,
        completed_at: new Date(now.getTime() - 86400000),
        day_of_week: 1,
        hour_of_day: 10,
      });
      await db.insertCompletion({
        task_id: taskId,
        completed_at: now,
        day_of_week: 2,
        hour_of_day: 14,
      });

      const completions = await db.getCompletions(taskId);
      expect(completions).toHaveLength(2);
      expect(completions[0].completed_at.getTime()).toBeGreaterThan(
        completions[1].completed_at.getTime()
      );
    });

    test('limits completion results', async () => {
      const taskId = await db.insertTask({ title: 'Test task' });

      for (let i = 0; i < 5; i++) {
        await db.insertCompletion({
          task_id: taskId,
          completed_at: new Date(),
          day_of_week: 0,
          hour_of_day: i,
        });
      }

      const completions = await db.getCompletions(taskId, 3);
      expect(completions).toHaveLength(3);
    });

    test('completions are deleted when task is deleted', async () => {
      const taskId = await db.insertTask({ title: 'Test task' });
      await db.insertCompletion({
        task_id: taskId,
        completed_at: new Date(),
        day_of_week: 0,
        hour_of_day: 12,
      });

      await db.deleteTask(taskId);

      const completions = await db.getCompletions(taskId);
      expect(completions).toHaveLength(0);
    });
  });

  describe('config operations', () => {
    test('sets and gets config values', async () => {
      await db.setConfig('custom_setting', { foo: 'bar', count: 42 });

      const value = await db.getConfig('custom_setting') as Record<string, unknown>;
      expect(value.foo).toBe('bar');
      expect(value.count).toBe(42);
    });

    test('overwrites existing config', async () => {
      await db.setConfig('key', 'value1');
      await db.setConfig('key', 'value2');

      const value = await db.getConfig('key');
      expect(value).toBe('value2');
    });

    test('returns null for non-existent config', async () => {
      const value = await db.getConfig('nonexistent');
      expect(value).toBeNull();
    });
  });

  describe('transactions', () => {
    test('commits successful transaction', async () => {
      db.transaction(() => {
        db.insertTask({ title: 'Task 1' });
        db.insertTask({ title: 'Task 2' });
      });

      const tasks = await db.getTasks();
      expect(tasks).toHaveLength(2);
    });

    test('rolls back failed transaction', async () => {
      try {
        db.transaction(() => {
          db.insertTask({ title: 'Task 1' });
          throw new Error('Simulated failure');
        });
      } catch {
        // Expected
      }

      const tasks = await db.getTasks();
      expect(tasks).toHaveLength(0);
    });
  });

  describe('task completion helpers', () => {
    test('sets last completed timestamp', async () => {
      const taskId = await db.insertTask({ title: 'Test task' });
      const completedAt = new Date('2025-01-10T15:00:00Z');

      await db.setTaskLastCompleted(taskId, completedAt);

      const task = await db.getTask(taskId);
      expect(task!.last_completed_at).toEqual(completedAt);
    });

    test('sets next due date', async () => {
      const taskId = await db.insertTask({ title: 'Test task' });
      const nextDue = new Date('2025-01-17T00:00:00Z');

      await db.setTaskNextDue(taskId, nextDue);

      const task = await db.getTask(taskId);
      expect(task!.next_due_at).toEqual(nextDue);
    });
  });
});
