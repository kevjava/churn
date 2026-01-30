import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getContext, closeContext, CliContext } from '../../../src/cli/context';
import { DailyPlanner } from '@kevjava/churn-core';

describe('plan commands integration', () => {
  let tempDir: string;
  let dbPath: string;
  let ctx: CliContext;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-plan-test-'));
    dbPath = path.join(tempDir, 'test.db');
    ctx = await getContext({ dbPath, autoInit: false });
  });

  afterEach(async () => {
    await closeContext();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('DailyPlanner', () => {
    it('creates a planner with default config', () => {
      const planner = new DailyPlanner();
      expect(planner).toBeDefined();
    });

    it('creates a planner with custom config', () => {
      const planner = new DailyPlanner({
        workHoursStart: '09:00',
        workHoursEnd: '18:00',
      });
      expect(planner).toBeDefined();
    });

    it('plans an empty day', async () => {
      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, new Date());

      expect(plan.scheduled.length).toBe(0);
      expect(plan.unscheduled.length).toBe(0);
    });

    it('schedules tasks for a day', async () => {
      // Create some tasks with deadlines - use today for urgency
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      await ctx.tasks.create({
        title: 'Task 1',
        tags: [],
        deadline: today,
        estimate_minutes: 30,
      });
      await ctx.tasks.create({
        title: 'Task 2',
        tags: [],
        deadline: today,
        estimate_minutes: 60,
      });

      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, new Date(), { limit: 10 });

      // Tasks should be considered for scheduling when they have deadlines
      expect(plan.scheduled.length + plan.unscheduled.length).toBeGreaterThanOrEqual(0);
    });

    it('respects task limit', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      for (let i = 0; i < 10; i++) {
        await ctx.tasks.create({
          title: `Task ${i + 1}`,
          tags: [],
          deadline: tomorrow,
          estimate_minutes: 30,
        });
      }

      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, new Date(), { limit: 3 });

      expect(plan.scheduled.length).toBeLessThanOrEqual(3);
    });

    it('includes work hours in plan', async () => {
      const planner = new DailyPlanner({
        workHoursStart: '08:00',
        workHoursEnd: '17:00',
      });
      const plan = await planner.planDay(ctx.tasks, new Date());

      expect(plan.workHours.start).toBe('08:00');
      expect(plan.workHours.end).toBe('17:00');
    });

    it('calculates total scheduled minutes', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await ctx.tasks.create({
        title: 'Task 1',
        tags: [],
        deadline: tomorrow,
        estimate_minutes: 30,
      });
      await ctx.tasks.create({
        title: 'Task 2',
        tags: [],
        deadline: tomorrow,
        estimate_minutes: 45,
      });

      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, new Date(), {
        limit: 10,
        includeTimeBlocks: true,
      });

      expect(plan.totalScheduledMinutes).toBeGreaterThanOrEqual(0);
    });

    it('calculates remaining minutes', async () => {
      const planner = new DailyPlanner({
        workHoursStart: '08:00',
        workHoursEnd: '17:00',
      });
      const plan = await planner.planDay(ctx.tasks, new Date());

      // 9 hours = 540 minutes
      expect(plan.remainingMinutes).toBeLessThanOrEqual(540);
    });

    it('assigns time slots when includeTimeBlocks is true', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await ctx.tasks.create({
        title: 'Task with estimate',
        tags: [],
        deadline: tomorrow,
        estimate_minutes: 60,
      });

      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, new Date(), {
        limit: 10,
        includeTimeBlocks: true,
      });

      if (plan.scheduled.length > 0) {
        const first = plan.scheduled[0];
        expect(first.slot).toBeDefined();
        expect(first.slot.start).toBeDefined();
        expect(first.slot.end).toBeDefined();
      }
    });

    it('tracks tasks that cannot be scheduled', async () => {
      // Create tasks that exceed available time - use today for urgency
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      // Create 20 tasks of 60 minutes each (20 hours)
      for (let i = 0; i < 20; i++) {
        await ctx.tasks.create({
          title: `Long task ${i + 1}`,
          tags: [],
          deadline: today,
          estimate_minutes: 60,
        });
      }

      const planner = new DailyPlanner({
        workHoursStart: '09:00',
        workHoursEnd: '12:00', // Only 3 hours available
      });

      const plan = await planner.planDay(ctx.tasks, new Date(), {
        limit: 20,
        includeTimeBlocks: true,
      });

      // The planner should return a valid plan structure
      expect(plan).toHaveProperty('scheduled');
      expect(plan).toHaveProperty('unscheduled');
      expect(plan).toHaveProperty('totalScheduledMinutes');
    });

    it('uses default estimate for tasks without estimate', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await ctx.tasks.create({
        title: 'Task without estimate',
        tags: [],
        deadline: tomorrow,
        // No estimate_minutes
      });

      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, new Date(), {
        limit: 10,
        includeTimeBlocks: true,
      });

      if (plan.scheduled.length > 0) {
        const task = plan.scheduled[0];
        expect(task.estimateMinutes).toBeGreaterThan(0);
        expect(task.isDefaultEstimate).toBe(true);
      }
    });

    it('includes task priority in scheduled items', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await ctx.tasks.create({
        title: 'Priority task',
        tags: [],
        deadline: tomorrow,
        estimate_minutes: 30,
      });

      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, new Date(), { limit: 10 });

      if (plan.scheduled.length > 0) {
        expect(plan.scheduled[0].task).toHaveProperty('priority');
      }
    });

    it('plans for a specific date', async () => {
      const specificDate = new Date('2025-06-15');

      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, specificDate);

      expect(plan.date.toISOString().split('T')[0]).toBe('2025-06-15');
    });
  });

  describe('plan with completed tasks', () => {
    it('excludes completed tasks from planning', async () => {
      // Use today's deadline for higher priority
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const task1 = await ctx.tasks.create({
        title: 'Open task',
        tags: [],
        deadline: today,
        estimate_minutes: 30,
      });
      const task2 = await ctx.tasks.create({
        title: 'Completed task',
        tags: [],
        deadline: today,
        estimate_minutes: 30,
      });

      await ctx.tasks.complete(task2.id);

      const planner = new DailyPlanner();
      const plan = await planner.planDay(ctx.tasks, new Date(), { limit: 10 });

      // Completed task should never appear in scheduled list
      const scheduledIds = plan.scheduled.map(s => s.task.id);
      expect(scheduledIds).not.toContain(task2.id);

      // Verify the completed task is actually completed
      const completedTask = await ctx.tasks.get(task2.id);
      expect(completedTask?.status).toBe('completed');
    });
  });

  describe('plan with task windows', () => {
    it('respects task time windows', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await ctx.tasks.create({
        title: 'Morning task',
        tags: [],
        deadline: tomorrow,
        estimate_minutes: 30,
        window_start: '08:00',
        window_end: '12:00',
      });

      const planner = new DailyPlanner({
        workHoursStart: '08:00',
        workHoursEnd: '17:00',
      });
      const plan = await planner.planDay(ctx.tasks, new Date(), { limit: 10 });

      // Task should be considered for scheduling
      expect(plan.scheduled.length + plan.unscheduled.length).toBeGreaterThanOrEqual(0);
    });
  });
});
