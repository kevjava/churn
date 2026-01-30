import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getContext, closeContext, initializeChurn, CliContext } from '../../src/cli/context';

describe('CLI context', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-context-test-'));
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(async () => {
    await closeContext();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getContext', () => {
    it('creates context with database and services', async () => {
      const ctx = await getContext({ dbPath, autoInit: false });

      expect(ctx.db).toBeDefined();
      expect(ctx.tasks).toBeDefined();
      expect(ctx.buckets).toBeDefined();
      expect(ctx.config).toBeDefined();
      expect(ctx.verbose).toBe(false);
    });

    it('respects verbose option', async () => {
      const ctx = await getContext({ dbPath, verbose: true, autoInit: false });
      expect(ctx.verbose).toBe(true);
    });

    it('returns same context on subsequent calls', async () => {
      const ctx1 = await getContext({ dbPath, autoInit: false });
      const ctx2 = await getContext({ dbPath, autoInit: false });
      expect(ctx1).toBe(ctx2);
    });

    it('uses custom config path', async () => {
      const configPath = path.join(tempDir, 'custom-config.json');
      const customConfig = {
        database: { path: '/custom/path.db' },
        defaults: { curve_type: 'exponential' },
      };
      fs.writeFileSync(configPath, JSON.stringify(customConfig));

      const ctx = await getContext({ dbPath, configPath, autoInit: false });
      expect(ctx.config.defaults.curve_type).toBe('exponential');
    });
  });

  describe('closeContext', () => {
    it('closes database connection', async () => {
      const ctx = await getContext({ dbPath, autoInit: false });
      expect(ctx.db).toBeDefined();

      await closeContext();

      // After closing, getContext should create a new context
      const ctx2 = await getContext({ dbPath, autoInit: false });
      expect(ctx2).not.toBe(ctx);
    });

    it('handles multiple close calls', async () => {
      await getContext({ dbPath, autoInit: false });
      await closeContext();
      await closeContext(); // Should not throw
    });
  });

  describe('initializeChurn', () => {
    it('creates database at specified path', async () => {
      const initDbPath = path.join(tempDir, 'init-test.db');

      await initializeChurn(initDbPath);

      expect(fs.existsSync(initDbPath)).toBe(true);
    });

    it('creates config directory', async () => {
      const configDir = path.join(os.homedir(), '.config', 'churn');
      const initDbPath = path.join(tempDir, 'init-test2.db');

      await initializeChurn(initDbPath);

      expect(fs.existsSync(configDir)).toBe(true);
    });
  });

  describe('context services', () => {
    let ctx: CliContext;

    beforeEach(async () => {
      ctx = await getContext({ dbPath, autoInit: false });
    });

    it('can create and retrieve tasks', async () => {
      const task = await ctx.tasks.create({
        title: 'Test task',
        tags: [],
      });

      expect(task.id).toBe(1);
      expect(task.title).toBe('Test task');

      const retrieved = await ctx.tasks.get(1);
      expect(retrieved?.title).toBe('Test task');
    });

    it('can create and retrieve buckets', async () => {
      const bucket = await ctx.buckets.create({
        name: 'TestBucket',
        type: 'project',
      });

      expect(bucket.id).toBe(1);
      expect(bucket.name).toBe('TestBucket');

      const retrieved = await ctx.buckets.get(1);
      expect(retrieved?.name).toBe('TestBucket');
    });

    it('can export data', async () => {
      await ctx.tasks.create({ title: 'Task 1', tags: [] });
      await ctx.buckets.create({ name: 'Bucket 1', type: 'project' });

      const data = await ctx.db.export();

      expect(data.version).toBe('1.0.0');
      expect(data.tasks.length).toBe(1);
      expect(data.buckets.length).toBe(1);
    });

    it('can list tasks with filters', async () => {
      await ctx.tasks.create({ title: 'Task 1', tags: [], project: 'proj1' });
      await ctx.tasks.create({ title: 'Task 2', tags: [], project: 'proj2' });

      const all = await ctx.tasks.list({});
      expect(all.length).toBe(2);

      const filtered = await ctx.tasks.list({ project: 'proj1' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('Task 1');
    });

    it('can get tasks by priority', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await ctx.tasks.create({ title: 'Task 1', tags: [], deadline: tomorrow });
      await ctx.tasks.create({ title: 'Task 2', tags: [] });

      const prioritized = await ctx.tasks.getByPriority(10);
      expect(prioritized.length).toBe(2);
      // Task with deadline should have higher priority
      expect(prioritized[0]).toHaveProperty('priority');
    });

    it('can complete and reopen tasks', async () => {
      const task = await ctx.tasks.create({ title: 'Task 1', tags: [] });

      await ctx.tasks.complete(task.id);
      let retrieved = await ctx.tasks.get(task.id);
      expect(retrieved?.status).toBe('completed');

      await ctx.tasks.reopen(task.id);
      retrieved = await ctx.tasks.get(task.id);
      expect(retrieved?.status).toBe('open');
    });

    it('can delete tasks', async () => {
      const task = await ctx.tasks.create({ title: 'Task 1', tags: [] });

      await ctx.tasks.delete(task.id);
      const retrieved = await ctx.tasks.get(task.id);
      expect(retrieved).toBeNull();
    });

    it('can update tasks', async () => {
      const task = await ctx.tasks.create({ title: 'Task 1', tags: [] });

      const updated = await ctx.tasks.update(task.id, { title: 'Updated Task' });
      expect(updated.title).toBe('Updated Task');

      const retrieved = await ctx.tasks.get(task.id);
      expect(retrieved?.title).toBe('Updated Task');
    });

    it('can search tasks', async () => {
      await ctx.tasks.create({ title: 'Buy groceries', tags: [] });
      await ctx.tasks.create({ title: 'Call mom', tags: [] });

      const results = await ctx.tasks.search('groceries');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Buy groceries');
    });

    it('can manage task dependencies', async () => {
      const task1 = await ctx.tasks.create({ title: 'Task 1', tags: [] });
      const task2 = await ctx.tasks.create({
        title: 'Task 2',
        tags: [],
        dependencies: [task1.id],
      });

      const deps = await ctx.tasks.getDependencies(task2.id);
      expect(deps.length).toBe(1);
      expect(deps[0].id).toBe(task1.id);

      const dependents = await ctx.tasks.getDependents(task1.id);
      expect(dependents.length).toBe(1);
      expect(dependents[0].id).toBe(task2.id);
    });

    it('can calculate priority', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task = await ctx.tasks.create({
        title: 'Task 1',
        tags: [],
        deadline: tomorrow,
      });

      const priority = await ctx.tasks.calculatePriority(task.id);
      expect(typeof priority).toBe('number');
      expect(priority).toBeGreaterThanOrEqual(0);
    });

    it('can list buckets', async () => {
      await ctx.buckets.create({ name: 'Bucket 1', type: 'project' });
      await ctx.buckets.create({ name: 'Bucket 2', type: 'category' });

      const buckets = await ctx.buckets.list();
      expect(buckets.length).toBe(2);
    });

    it('can get bucket by name', async () => {
      await ctx.buckets.create({ name: 'MyBucket', type: 'project' });

      const bucket = await ctx.buckets.getByName('MyBucket');
      expect(bucket?.name).toBe('MyBucket');
    });

    it('can delete buckets', async () => {
      const bucket = await ctx.buckets.create({ name: 'ToDelete', type: 'project' });

      await ctx.buckets.delete(bucket.id);
      const retrieved = await ctx.buckets.get(bucket.id);
      expect(retrieved).toBeNull();
    });

    it('can get tasks in a bucket', async () => {
      const bucket = await ctx.buckets.create({ name: 'MyBucket', type: 'project' });
      await ctx.tasks.create({ title: 'Task 1', tags: [], bucket_id: bucket.id });
      await ctx.tasks.create({ title: 'Task 2', tags: [], bucket_id: bucket.id });
      await ctx.tasks.create({ title: 'Task 3', tags: [] }); // No bucket

      const tasksInBucket = await ctx.buckets.getTasks(bucket.id);
      expect(tasksInBucket.length).toBe(2);
    });
  });
});
