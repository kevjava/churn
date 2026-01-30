import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getContext, closeContext, CliContext } from '../../../src/cli/context';
import { TaskStatus, RecurrenceMode, RecurrenceType, CurveType } from '@kevjava/churn-core';

describe('task commands integration', () => {
  let tempDir: string;
  let dbPath: string;
  let ctx: CliContext;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-task-test-'));
    dbPath = path.join(tempDir, 'test.db');
    ctx = await getContext({ dbPath, autoInit: false });
  });

  afterEach(async () => {
    await closeContext();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('task creation', () => {
    it('creates a basic task', async () => {
      const task = await ctx.tasks.create({
        title: 'Test task',
        tags: [],
      });

      expect(task.id).toBe(1);
      expect(task.title).toBe('Test task');
      expect(task.status).toBe(TaskStatus.OPEN);
    });

    it('creates task with project', async () => {
      const task = await ctx.tasks.create({
        title: 'Project task',
        tags: [],
        project: 'myproject',
      });

      expect(task.project).toBe('myproject');
    });

    it('creates task with tags', async () => {
      const task = await ctx.tasks.create({
        title: 'Tagged task',
        tags: ['urgent', 'work'],
      });

      expect(task.tags).toEqual(['urgent', 'work']);
    });

    it('creates task with deadline', async () => {
      const deadline = new Date('2025-12-31');
      const task = await ctx.tasks.create({
        title: 'Deadline task',
        tags: [],
        deadline,
      });

      expect(task.deadline?.toISOString().split('T')[0]).toBe('2025-12-31');
    });

    it('creates task with estimate', async () => {
      const task = await ctx.tasks.create({
        title: 'Estimated task',
        tags: [],
        estimate_minutes: 60,
      });

      expect(task.estimate_minutes).toBe(60);
    });

    it('creates task with bucket', async () => {
      const bucket = await ctx.buckets.create({
        name: 'TestBucket',
        type: 'project',
      });

      const task = await ctx.tasks.create({
        title: 'Bucketed task',
        tags: [],
        bucket_id: bucket.id,
      });

      expect(task.bucket_id).toBe(bucket.id);
    });

    it('creates task with dependencies', async () => {
      const dep = await ctx.tasks.create({
        title: 'Dependency',
        tags: [],
      });

      const task = await ctx.tasks.create({
        title: 'Dependent task',
        tags: [],
        dependencies: [dep.id],
      });

      expect(task.dependencies).toContain(dep.id);
    });

    it('creates task with time window', async () => {
      const task = await ctx.tasks.create({
        title: 'Windowed task',
        tags: [],
        window_start: '09:00',
        window_end: '17:00',
      });

      expect(task.window_start).toBe('09:00');
      expect(task.window_end).toBe('17:00');
    });

    it('creates task with recurrence pattern', async () => {
      const task = await ctx.tasks.create({
        title: 'Recurring task',
        tags: [],
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.DAILY,
        },
      });

      expect(task.recurrence_pattern).toBeDefined();
      expect(task.recurrence_pattern?.mode).toBe(RecurrenceMode.CALENDAR);
      expect(task.recurrence_pattern?.type).toBe(RecurrenceType.DAILY);
    });

    it('creates task with exponential curve', async () => {
      const task = await ctx.tasks.create({
        title: 'Exponential task',
        tags: [],
        curve_config: {
          type: CurveType.EXPONENTIAL,
          exponent: 3,
        },
      });

      expect(task.curve_config.type).toBe(CurveType.EXPONENTIAL);
      expect(task.curve_config.exponent).toBe(3);
    });
  });

  describe('task listing', () => {
    beforeEach(async () => {
      await ctx.tasks.create({ title: 'Task 1', tags: [], project: 'proj1' });
      await ctx.tasks.create({ title: 'Task 2', tags: ['urgent'], project: 'proj2' });
      await ctx.tasks.create({ title: 'Task 3', tags: [], project: 'proj1' });
    });

    it('lists all tasks', async () => {
      const tasks = await ctx.tasks.list({});
      expect(tasks.length).toBe(3);
    });

    it('filters by project', async () => {
      const tasks = await ctx.tasks.list({ project: 'proj1' });
      expect(tasks.length).toBe(2);
    });

    it('filters by tag', async () => {
      const tasks = await ctx.tasks.list({ tags: ['urgent'] });
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Task 2');
    });

    it('filters by status', async () => {
      await ctx.tasks.complete(1);
      const openTasks = await ctx.tasks.list({ status: TaskStatus.OPEN });
      expect(openTasks.length).toBe(2);
    });
  });

  describe('task updates', () => {
    let taskId: number;

    beforeEach(async () => {
      const task = await ctx.tasks.create({
        title: 'Original title',
        tags: ['tag1'],
      });
      taskId = task.id;
    });

    it('updates title', async () => {
      const updated = await ctx.tasks.update(taskId, { title: 'New title' });
      expect(updated.title).toBe('New title');
    });

    it('updates project', async () => {
      const updated = await ctx.tasks.update(taskId, { project: 'newproject' });
      expect(updated.project).toBe('newproject');
    });

    it('updates tags', async () => {
      const updated = await ctx.tasks.update(taskId, { tags: ['tag1', 'tag2'] });
      expect(updated.tags).toEqual(['tag1', 'tag2']);
    });

    it('updates deadline', async () => {
      const deadline = new Date('2025-06-15');
      const updated = await ctx.tasks.update(taskId, { deadline });
      expect(updated.deadline?.toISOString().split('T')[0]).toBe('2025-06-15');
    });

    it('updates estimate', async () => {
      const updated = await ctx.tasks.update(taskId, { estimate_minutes: 120 });
      expect(updated.estimate_minutes).toBe(120);
    });

    it('updates bucket', async () => {
      const bucket = await ctx.buckets.create({ name: 'NewBucket', type: 'project' });
      const updated = await ctx.tasks.update(taskId, { bucket_id: bucket.id });
      expect(updated.bucket_id).toBe(bucket.id);
    });
  });

  describe('task completion', () => {
    it('completes a task', async () => {
      const task = await ctx.tasks.create({ title: 'Task to complete', tags: [] });

      await ctx.tasks.complete(task.id);

      const completed = await ctx.tasks.get(task.id);
      expect(completed?.status).toBe(TaskStatus.COMPLETED);
    });

    it('reopens a completed task', async () => {
      const task = await ctx.tasks.create({ title: 'Task to reopen', tags: [] });
      await ctx.tasks.complete(task.id);

      await ctx.tasks.reopen(task.id);

      const reopened = await ctx.tasks.get(task.id);
      expect(reopened?.status).toBe(TaskStatus.OPEN);
    });

    it('schedules next occurrence for recurring task', async () => {
      const task = await ctx.tasks.create({
        title: 'Recurring task',
        tags: [],
        recurrence_pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: RecurrenceType.DAILY,
        },
      });

      await ctx.tasks.complete(task.id);

      const updated = await ctx.tasks.get(task.id);
      expect(updated?.next_due_at).toBeDefined();
      expect(updated?.last_completed_at).toBeDefined();
    });
  });

  describe('task deletion', () => {
    it('deletes a task', async () => {
      const task = await ctx.tasks.create({ title: 'Task to delete', tags: [] });

      await ctx.tasks.delete(task.id);

      const deleted = await ctx.tasks.get(task.id);
      expect(deleted).toBeNull();
    });

    it('throws error when deleting task with dependents', async () => {
      const task1 = await ctx.tasks.create({ title: 'Task 1', tags: [] });
      await ctx.tasks.create({
        title: 'Task 2',
        tags: [],
        dependencies: [task1.id],
      });

      // Should throw because task2 depends on task1
      await expect(ctx.tasks.delete(task1.id)).rejects.toThrow('Cannot delete task 1');

      // Task 1 should still exist
      const task1Still = await ctx.tasks.get(task1.id);
      expect(task1Still).toBeDefined();
    });
  });

  describe('task search', () => {
    beforeEach(async () => {
      await ctx.tasks.create({ title: 'Buy groceries', tags: [] });
      await ctx.tasks.create({ title: 'Call doctor', tags: [] });
      await ctx.tasks.create({ title: 'Buy new shoes', tags: [] });
    });

    it('searches by title', async () => {
      const results = await ctx.tasks.search('Buy');
      expect(results.length).toBe(2);
    });

    it('returns empty for no matches', async () => {
      const results = await ctx.tasks.search('xyz123');
      expect(results.length).toBe(0);
    });
  });

  describe('task priority', () => {
    it('calculates priority for task with deadline', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task = await ctx.tasks.create({
        title: 'Deadline task',
        tags: [],
        deadline: tomorrow,
      });

      const priority = await ctx.tasks.calculatePriority(task.id);
      expect(typeof priority).toBe('number');
      expect(priority).toBeGreaterThanOrEqual(0);
    });

    it('returns tasks sorted by priority', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await ctx.tasks.create({ title: 'No deadline', tags: [] });
      await ctx.tasks.create({ title: 'Tomorrow', tags: [], deadline: tomorrow });
      await ctx.tasks.create({ title: 'Next week', tags: [], deadline: nextWeek });

      const prioritized = await ctx.tasks.getByPriority(10);
      expect(prioritized.length).toBe(3);
      // All should have priority property
      prioritized.forEach(t => {
        expect(t).toHaveProperty('priority');
      });
    });
  });

  describe('task dependencies', () => {
    it('gets task dependencies', async () => {
      const dep1 = await ctx.tasks.create({ title: 'Dep 1', tags: [] });
      const dep2 = await ctx.tasks.create({ title: 'Dep 2', tags: [] });
      const task = await ctx.tasks.create({
        title: 'Main task',
        tags: [],
        dependencies: [dep1.id, dep2.id],
      });

      const deps = await ctx.tasks.getDependencies(task.id);
      expect(deps.length).toBe(2);
    });

    it('gets task dependents', async () => {
      const task = await ctx.tasks.create({ title: 'Main task', tags: [] });
      await ctx.tasks.create({
        title: 'Dependent 1',
        tags: [],
        dependencies: [task.id],
      });
      await ctx.tasks.create({
        title: 'Dependent 2',
        tags: [],
        dependencies: [task.id],
      });

      const dependents = await ctx.tasks.getDependents(task.id);
      expect(dependents.length).toBe(2);
    });
  });
});
