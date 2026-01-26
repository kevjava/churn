import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ChurnConfig {
  database: {
    path: string;
  };
  defaults: {
    curve_type: string;
    work_hours_start: string;
    work_hours_end: string;
  };
  display: {
    date_format: string;
    time_format: string;
  };
  logging: {
    level: string;
    file: string;
  };
}

const DEFAULT_CONFIG: ChurnConfig = {
  database: {
    path: '~/.config/churn/churn.db',
  },
  defaults: {
    curve_type: 'linear',
    work_hours_start: '08:00',
    work_hours_end: '17:00',
  },
  display: {
    date_format: 'YYYY-MM-DD',
    time_format: '24h',
  },
  logging: {
    level: 'info',
    file: '~/.config/churn/churn.log',
  },
};

export function getConfigDir(): string {
  return path.join(os.homedir(), '.config', 'churn');
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function getDefaultDbPath(): string {
  return path.join(getConfigDir(), 'churn.db');
}

export function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function loadConfig(configPath?: string): ChurnConfig {
  const filePath = configPath ?? getConfigPath();

  if (!fs.existsSync(filePath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const loaded = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: ChurnConfig, configPath?: string): void {
  const filePath = configPath ?? getConfigPath();
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

export function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function isInitialized(): boolean {
  return fs.existsSync(getDefaultDbPath());
}
