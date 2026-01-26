import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database } from '../../src/core/database';
import { BucketService } from '../../src/core/bucket-service';
import { TaskService } from '../../src/core/task-service';

describe('BucketService', () => {
  let db: Database;
  let service: BucketService;
  let taskService: TaskService;
  let dbPath: string;

  beforeEach(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = new Database(dbPath);
    await db.init();
    service = new BucketService(db);
    taskService = new TaskService(db);
  });

  afterEach(async () => {
    await db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  describe('CRUD operations', () => {
    test('creates a bucket', async () => {
      const bucket = await service.create({
        name: 'ProjectA',
        type: 'project',
      });

      expect(bucket.id).toBeDefined();
      expect(bucket.name).toBe('ProjectA');
      expect(bucket.type).toBe('project');
    });

    test('creates bucket with config', async () => {
      const bucket = await service.create({
        name: 'Deep Work',
        type: 'context',
        config: {
          preferred_times: ['mornings'],
          min_block_duration: 120,
          interruptible: false,
        },
      });

      expect(bucket.config.preferred_times).toEqual(['mornings']);
      expect(bucket.config.min_block_duration).toBe(120);
      expect(bucket.config.interruptible).toBe(false);
    });

    test('prevents duplicate bucket names', async () => {
      await service.create({ name: 'Unique', type: 'category' });

      await expect(
        service.create({ name: 'Unique', type: 'project' })
      ).rejects.toThrow('already exists');
    });

    test('gets bucket by id', async () => {
      const created = await service.create({ name: 'Test', type: 'category' });
      const bucket = await service.get(created.id);

      expect(bucket).not.toBeNull();
      expect(bucket!.name).toBe('Test');
    });

    test('returns null for non-existent bucket', async () => {
      const bucket = await service.get(99999);
      expect(bucket).toBeNull();
    });

    test('gets bucket by name', async () => {
      await service.create({ name: 'Admin', type: 'category' });
      const bucket = await service.getByName('Admin');

      expect(bucket).not.toBeNull();
      expect(bucket!.name).toBe('Admin');
    });

    test('returns null for non-existent bucket name', async () => {
      const bucket = await service.getByName('NonExistent');
      expect(bucket).toBeNull();
    });

    test('lists all buckets', async () => {
      await service.create({ name: 'Bucket A', type: 'project' });
      await service.create({ name: 'Bucket B', type: 'category' });
      await service.create({ name: 'Bucket C', type: 'context' });

      const buckets = await service.list();
      expect(buckets).toHaveLength(3);
    });

    test('updates a bucket', async () => {
      const bucket = await service.create({
        name: 'Old Name',
        type: 'project',
      });

      const updated = await service.update(bucket.id, {
        name: 'New Name',
        config: { hours_per_week: 20 },
      });

      expect(updated.name).toBe('New Name');
      expect(updated.config.hours_per_week).toBe(20);
    });

    test('prevents renaming to existing bucket name', async () => {
      await service.create({ name: 'Existing', type: 'category' });
      const bucket = await service.create({ name: 'ToRename', type: 'project' });

      await expect(
        service.update(bucket.id, { name: 'Existing' })
      ).rejects.toThrow('already exists');
    });

    test('throws on update of non-existent bucket', async () => {
      await expect(
        service.update(99999, { name: 'Whatever' })
      ).rejects.toThrow('not found');
    });

    test('deletes a bucket', async () => {
      const bucket = await service.create({ name: 'ToDelete', type: 'category' });
      await service.delete(bucket.id);

      const result = await service.get(bucket.id);
      expect(result).toBeNull();
    });

    test('throws on delete of non-existent bucket', async () => {
      await expect(service.delete(99999)).rejects.toThrow('not found');
    });
  });

  describe('getTasks', () => {
    test('returns tasks in bucket', async () => {
      const bucket = await service.create({ name: 'Work', type: 'project' });

      await taskService.create({ title: 'Task 1', bucket_id: bucket.id });
      await taskService.create({ title: 'Task 2', bucket_id: bucket.id });
      await taskService.create({ title: 'Task 3' }); // No bucket

      const tasks = await service.getTasks(bucket.id);
      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.title)).toContain('Task 1');
      expect(tasks.map((t) => t.title)).toContain('Task 2');
    });

    test('returns empty array for bucket with no tasks', async () => {
      const bucket = await service.create({ name: 'Empty', type: 'category' });
      const tasks = await service.getTasks(bucket.id);
      expect(tasks).toHaveLength(0);
    });

    test('throws for non-existent bucket', async () => {
      await expect(service.getTasks(99999)).rejects.toThrow('not found');
    });
  });

  describe('bucket-task relationship', () => {
    test('task bucket_id is cleared when bucket is deleted', async () => {
      const bucket = await service.create({ name: 'Temp', type: 'project' });
      const task = await taskService.create({
        title: 'Task',
        bucket_id: bucket.id,
      });

      expect(task.bucket_id).toBe(bucket.id);

      await service.delete(bucket.id);

      const updatedTask = await taskService.get(task.id);
      expect(updatedTask!.bucket_id).toBeUndefined();
    });
  });
});
