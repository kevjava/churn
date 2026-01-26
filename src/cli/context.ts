import { Database, TaskService, BucketService } from '../core';
import {
  ChurnConfig,
  loadConfig,
  expandPath,
  getDefaultDbPath,
  ensureConfigDir,
  isInitialized,
  saveConfig,
} from './config';

export interface CliContext {
  db: Database;
  tasks: TaskService;
  buckets: BucketService;
  config: ChurnConfig;
  verbose: boolean;
}

let currentContext: CliContext | null = null;

export interface ContextOptions {
  configPath?: string;
  dbPath?: string;
  verbose?: boolean;
  autoInit?: boolean;
}

export async function getContext(options: ContextOptions = {}): Promise<CliContext> {
  if (currentContext) {
    return currentContext;
  }

  const config = loadConfig(options.configPath);
  const dbPath = options.dbPath ?? expandPath(config.database.path) ?? getDefaultDbPath();

  // Auto-initialize if needed
  if (options.autoInit !== false && !isInitialized()) {
    await initializeChurn(dbPath, config, options.configPath);
  }

  const db = new Database(dbPath);
  await db.init();

  const tasks = new TaskService(db);
  const buckets = new BucketService(db);

  currentContext = {
    db,
    tasks,
    buckets,
    config,
    verbose: options.verbose ?? false,
  };

  return currentContext;
}

export async function initializeChurn(
  dbPath?: string,
  config?: ChurnConfig,
  configPath?: string
): Promise<void> {
  ensureConfigDir();

  const finalDbPath = dbPath ?? getDefaultDbPath();
  const finalConfig = config ?? loadConfig(configPath);

  // Save config
  saveConfig(finalConfig, configPath);

  // Initialize database
  const db = new Database(finalDbPath);
  await db.init();
  await db.close();
}

export async function closeContext(): Promise<void> {
  if (currentContext) {
    await currentContext.db.close();
    currentContext = null;
  }
}
