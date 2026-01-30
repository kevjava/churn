import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getContext, closeContext, CliContext } from '../../../src/cli/context';

describe('bucket commands integration', () => {
  let tempDir: string;
  let dbPath: string;
  let ctx: CliContext;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-bucket-test-'));
    dbPath = path.join(tempDir, 'test.db');
    ctx = await getContext({ dbPath, autoInit: false });
  });

  afterEach(async () => {
    await closeContext();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('bucket creation', () => {
    it('creates a project bucket', async () => {
      const bucket = await ctx.buckets.create({
        name: 'MyProject',
        type: 'project',
      });

      expect(bucket.id).toBe(1);
      expect(bucket.name).toBe('MyProject');
      expect(bucket.type).toBe('project');
    });

    it('creates a category bucket', async () => {
      const bucket = await ctx.buckets.create({
        name: 'Work',
        type: 'category',
      });

      expect(bucket.type).toBe('category');
    });

    it('creates a context bucket', async () => {
      const bucket = await ctx.buckets.create({
        name: 'Home',
        type: 'context',
      });

      expect(bucket.type).toBe('context');
    });

    it('creates bucket with config', async () => {
      const bucket = await ctx.buckets.create({
        name: 'CustomBucket',
        type: 'project',
        config: { hours_per_week: 10, interruptible: true },
      });

      expect(bucket.config).toEqual({ hours_per_week: 10, interruptible: true });
    });
  });

  describe('bucket listing', () => {
    beforeEach(async () => {
      await ctx.buckets.create({ name: 'Bucket1', type: 'project' });
      await ctx.buckets.create({ name: 'Bucket2', type: 'category' });
      await ctx.buckets.create({ name: 'Bucket3', type: 'context' });
    });

    it('lists all buckets', async () => {
      const buckets = await ctx.buckets.list();
      expect(buckets.length).toBe(3);
    });

    it('returns buckets in order', async () => {
      const buckets = await ctx.buckets.list();
      expect(buckets[0].name).toBe('Bucket1');
      expect(buckets[1].name).toBe('Bucket2');
      expect(buckets[2].name).toBe('Bucket3');
    });
  });

  describe('bucket retrieval', () => {
    let bucketId: number;

    beforeEach(async () => {
      const bucket = await ctx.buckets.create({ name: 'TestBucket', type: 'project' });
      bucketId = bucket.id;
    });

    it('gets bucket by id', async () => {
      const bucket = await ctx.buckets.get(bucketId);
      expect(bucket?.name).toBe('TestBucket');
    });

    it('gets bucket by name', async () => {
      const bucket = await ctx.buckets.getByName('TestBucket');
      expect(bucket?.id).toBe(bucketId);
    });

    it('returns null for non-existent bucket', async () => {
      const bucket = await ctx.buckets.get(999);
      expect(bucket).toBeNull();
    });

    it('returns null for non-existent name', async () => {
      const bucket = await ctx.buckets.getByName('DoesNotExist');
      expect(bucket).toBeNull();
    });
  });

  describe('bucket deletion', () => {
    it('deletes a bucket', async () => {
      const bucket = await ctx.buckets.create({ name: 'ToDelete', type: 'project' });

      await ctx.buckets.delete(bucket.id);

      const deleted = await ctx.buckets.get(bucket.id);
      expect(deleted).toBeNull();
    });

    it('unassigns tasks when bucket is deleted', async () => {
      const bucket = await ctx.buckets.create({ name: 'WithTasks', type: 'project' });
      const task = await ctx.tasks.create({
        title: 'Task in bucket',
        tags: [],
        bucket_id: bucket.id,
      });

      await ctx.buckets.delete(bucket.id);

      const updatedTask = await ctx.tasks.get(task.id);
      expect(updatedTask?.bucket_id).toBeUndefined();
    });
  });

  describe('bucket tasks', () => {
    let bucketId: number;

    beforeEach(async () => {
      const bucket = await ctx.buckets.create({ name: 'TaskBucket', type: 'project' });
      bucketId = bucket.id;

      await ctx.tasks.create({ title: 'Task 1', tags: [], bucket_id: bucketId });
      await ctx.tasks.create({ title: 'Task 2', tags: [], bucket_id: bucketId });
      await ctx.tasks.create({ title: 'Task 3', tags: [] }); // No bucket
    });

    it('gets tasks in bucket', async () => {
      const tasks = await ctx.buckets.getTasks(bucketId);
      expect(tasks.length).toBe(2);
    });

    it('returns empty array for bucket with no tasks', async () => {
      const emptyBucket = await ctx.buckets.create({ name: 'Empty', type: 'project' });
      const tasks = await ctx.buckets.getTasks(emptyBucket.id);
      expect(tasks.length).toBe(0);
    });
  });
});
