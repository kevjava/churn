import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getContext, closeContext, CliContext } from '../../../src/cli/context';
import { Database, CurveType, ExportData } from '@kevjava/churn-core';

describe('data commands integration', () => {
  let tempDir: string;
  let dbPath: string;
  let ctx: CliContext;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-data-test-'));
    dbPath = path.join(tempDir, 'test.db');
    ctx = await getContext({ dbPath, autoInit: false });
  });

  afterEach(async () => {
    await closeContext();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('export', () => {
    it('exports empty database', async () => {
      const data = await ctx.db.export();

      expect(data.version).toBe('1.0.0');
      expect(data.exported_at).toBeDefined();
      expect(data.tasks).toEqual([]);
      expect(data.buckets).toEqual([]);
      expect(data.completions).toEqual([]);
    });

    it('exports tasks', async () => {
      await ctx.tasks.create({ title: 'Task 1', tags: ['tag1'] });
      await ctx.tasks.create({ title: 'Task 2', tags: [], project: 'proj1' });

      const data = await ctx.db.export();

      expect(data.tasks.length).toBe(2);
      const task1 = data.tasks.find((t) => t.title === 'Task 1');
      const task2 = data.tasks.find((t) => t.title === 'Task 2');
      expect(task1).toBeDefined();
      expect(task1!.tags).toEqual(['tag1']);
      expect(task2).toBeDefined();
      expect(task2!.project).toBe('proj1');
    });

    it('exports buckets', async () => {
      await ctx.buckets.create({ name: 'Bucket1', type: 'project' });
      await ctx.buckets.create({ name: 'Bucket2', type: 'category' });

      const data = await ctx.db.export();

      expect(data.buckets.length).toBe(2);
      expect(data.buckets[0].name).toBe('Bucket1');
      expect(data.buckets[1].type).toBe('category');
    });

    it('exports completions', async () => {
      const task = await ctx.tasks.create({ title: 'Task 1', tags: [] });
      await ctx.tasks.complete(task.id);

      const data = await ctx.db.export();

      expect(data.completions.length).toBe(1);
      expect(data.completions[0].task_id).toBe(task.id);
    });

    it('exports task with all fields', async () => {
      const deadline = new Date('2025-12-31');
      const bucket = await ctx.buckets.create({ name: 'TestBucket', type: 'project' });

      await ctx.tasks.create({
        title: 'Full task',
        tags: ['urgent', 'work'],
        project: 'myproject',
        deadline,
        estimate_minutes: 60,
        bucket_id: bucket.id,
        window_start: '09:00',
        window_end: '17:00',
        curve_config: {
          type: CurveType.EXPONENTIAL,
          exponent: 2,
        },
      });

      const data = await ctx.db.export();

      const exportedTask = data.tasks[0];
      expect(exportedTask.title).toBe('Full task');
      expect(exportedTask.tags).toEqual(['urgent', 'work']);
      expect(exportedTask.project).toBe('myproject');
      expect(exportedTask.estimate_minutes).toBe(60);
      expect(exportedTask.bucket_id).toBe(bucket.id);
    });

    it('can write export to file', async () => {
      await ctx.tasks.create({ title: 'Task 1', tags: [] });

      const data = await ctx.db.export();
      const exportPath = path.join(tempDir, 'export.json');
      fs.writeFileSync(exportPath, JSON.stringify(data, null, 2));

      expect(fs.existsSync(exportPath)).toBe(true);

      const loaded = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(loaded.tasks.length).toBe(1);
    });
  });

  describe('import', () => {
    it('imports tasks into empty database', async () => {
      const exportData = {
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        tasks: [
          {
            id: 1,
            title: 'Imported task',
            tags: ['imported'],
            dependencies: [],
            curve_config: { type: CurveType.LINEAR },
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        buckets: [],
        completions: [],
      };

      const result = await ctx.db.import(exportData, false);

      expect(result.tasks.imported).toBe(1);
      expect(result.tasks.skipped).toBe(0);

      const tasks = await ctx.tasks.list({});
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Imported task');
    });

    it('imports buckets', async () => {
      const exportData = {
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        tasks: [],
        buckets: [
          {
            id: 1,
            name: 'Imported bucket',
            type: 'project',
            config: {},
          },
        ],
        completions: [],
      };

      const result = await ctx.db.import(exportData, false);

      expect(result.buckets.imported).toBe(1);

      const buckets = await ctx.buckets.list();
      expect(buckets.length).toBe(1);
      expect(buckets[0].name).toBe('Imported bucket');
    });

    it('merges with existing data', async () => {
      // Create existing data
      await ctx.tasks.create({ title: 'Existing task', tags: [] });

      const exportData = {
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        tasks: [
          {
            id: 100, // Different ID
            title: 'New task',
            tags: [],
            dependencies: [],
            curve_config: { type: CurveType.LINEAR },
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        buckets: [],
        completions: [],
      };

      await ctx.db.import(exportData, true); // merge = true

      const tasks = await ctx.tasks.list({});
      expect(tasks.length).toBe(2);
    });

    it('replaces existing data when not merging', async () => {
      // Create existing data
      await ctx.tasks.create({ title: 'Existing task', tags: [] });

      const exportData = {
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        tasks: [
          {
            id: 1,
            title: 'Replacement task',
            tags: [],
            dependencies: [],
            curve_config: { type: CurveType.LINEAR },
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        buckets: [],
        completions: [],
      };

      await ctx.db.import(exportData, false); // merge = false

      const tasks = await ctx.tasks.list({});
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Replacement task');
    });

    it('preserves task relationships', async () => {
      const exportData = {
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        tasks: [
          {
            id: 1,
            title: 'Parent task',
            tags: [],
            dependencies: [],
            curve_config: { type: CurveType.LINEAR },
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 2,
            title: 'Child task',
            tags: [],
            dependencies: [1],
            curve_config: { type: CurveType.LINEAR },
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        buckets: [],
        completions: [],
      };

      await ctx.db.import(exportData, false);

      const deps = await ctx.tasks.getDependencies(2);
      expect(deps.length).toBe(1);
      expect(deps[0].id).toBe(1);
    });

    it('imports completions', async () => {
      const completedAt = new Date();

      const exportData = {
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        tasks: [
          {
            id: 1,
            title: 'Completed task',
            tags: [],
            dependencies: [],
            curve_config: { type: CurveType.LINEAR },
            status: 'completed',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        buckets: [],
        completions: [
          {
            id: 1,
            task_id: 1,
            completed_at: completedAt.toISOString(),
            scheduled_minutes: 30,
            interruptions: 0,
            day_of_week: completedAt.getDay(),
            hour_of_day: completedAt.getHours(),
          },
        ],
      };

      const result = await ctx.db.import(exportData, false);

      expect(result.completions.imported).toBe(1);
    });
  });

  describe('round-trip export/import', () => {
    it('preserves data through export/import cycle', async () => {
      // Create complex data
      const bucket = await ctx.buckets.create({ name: 'TestBucket', type: 'project' });
      const task1 = await ctx.tasks.create({
        title: 'Task 1',
        tags: ['tag1', 'tag2'],
        project: 'proj1',
        bucket_id: bucket.id,
        estimate_minutes: 60,
      });
      const task2 = await ctx.tasks.create({
        title: 'Task 2',
        tags: [],
        dependencies: [task1.id],
      });
      await ctx.tasks.complete(task1.id);

      // Export
      const exportData = await ctx.db.export();

      // Create new database
      await closeContext();
      const newDbPath = path.join(tempDir, 'new.db');
      const newDb = new Database(newDbPath);
      await newDb.init();

      // Import
      await newDb.import(exportData, false);

      // Verify
      const newCtx = await getContext({ dbPath: newDbPath, autoInit: false });

      const tasks = await newCtx.tasks.list({});
      expect(tasks.length).toBe(2);

      const buckets = await newCtx.buckets.list();
      expect(buckets.length).toBe(1);
      expect(buckets[0].name).toBe('TestBucket');

      const reimportedTask1 = await newCtx.tasks.get(1);
      expect(reimportedTask1?.tags).toEqual(['tag1', 'tag2']);
      expect(reimportedTask1?.project).toBe('proj1');

      const deps = await newCtx.tasks.getDependencies(2);
      expect(deps.length).toBe(1);

      await newDb.close();
    });
  });
});
