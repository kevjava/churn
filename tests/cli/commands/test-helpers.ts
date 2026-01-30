import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database, TaskService, BucketService } from '@kevjava/churn-core';

export interface TestContext {
  tempDir: string;
  dbPath: string;
  db: Database;
  tasks: TaskService;
  buckets: BucketService;
  cleanup: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-cmd-test-'));
  const dbPath = path.join(tempDir, 'test.db');

  const db = new Database(dbPath);
  await db.init();

  const tasks = new TaskService(db);
  const buckets = new BucketService(db);

  const cleanup = async () => {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  return {
    tempDir,
    dbPath,
    db,
    tasks,
    buckets,
    cleanup,
  };
}

export function captureConsole(): {
  log: string[];
  error: string[];
  warn: string[];
  restore: () => void;
} {
  const log: string[] = [];
  const error: string[] = [];
  const warn: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    log.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    error.push(args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    warn.push(args.map(String).join(' '));
  };

  return {
    log,
    error,
    warn,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

export function mockProcessExit(): { calls: number[]; restore: () => void } {
  const calls: number[] = [];
  const originalExit = process.exit;

  process.exit = ((code?: number) => {
    calls.push(code ?? 0);
    throw new Error(`process.exit(${code})`);
  }) as typeof process.exit;

  return {
    calls,
    restore: () => {
      process.exit = originalExit;
    },
  };
}
