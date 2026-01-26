# Task Parser Library Specification

## Overview

The `task-parser` library provides a shared grammar parser for task descriptions. It's used by both `churn` and `tt-time-tracker` to maintain consistent syntax across tools.

## Repository Structure

```
task-parser/
├── src/
│   ├── index.ts           # Main exports
│   ├── parser.ts          # TaskParser class
│   ├── types.ts           # TypeScript interfaces
│   ├── date-parser.ts     # Date parsing utilities
│   ├── duration-parser.ts # Duration parsing utilities
│   └── validators.ts      # Validation functions
├── tests/
│   ├── parser.test.ts
│   ├── dates.test.ts
│   ├── durations.test.ts
│   └── edge-cases.test.ts
├── package.json
├── tsconfig.json
├── jest.config.js
├── README.md
└── LICENSE
```

## Package Configuration

### package.json
```json
{
  "name": "@kevjava/task-parser",
  "version": "1.0.0",
  "description": "Shared task description grammar parser for churn and tt",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["task", "parser", "grammar", "churn", "time-tracking"],
  "author": "Kevin",
  "license": "MIT",
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  },
  "files": [
    "dist/**/*",
    "README.md"
  ]
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### jest.config.js
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

## Type Definitions

### src/types.ts
```typescript
export enum RecurrenceMode {
  CALENDAR = 'calendar',
  COMPLETION = 'completion',
}

export enum RecurrenceType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  INTERVAL = 'interval',
}

export interface RecurrencePattern {
  mode: RecurrenceMode;
  type: RecurrenceType;
  interval?: number;
  unit?: 'days' | 'weeks' | 'months';
  dayOfWeek?: number; // 0-6
  anchor?: Date;
}

export interface TimeWindow {
  start: string; // HH:MM
  end: string;   // HH:MM
}

export interface ParsedTask {
  title: string;
  date?: Date;
  project?: string;
  tags: string[];
  duration?: number; // minutes
  bucket?: string;
  recurrence?: RecurrencePattern;
  window?: TimeWindow;
  dependencies?: number[];
  raw: string;
}
```

## Parser Implementation

### src/parser.ts
```typescript
import { ParsedTask, RecurrencePattern, TimeWindow, RecurrenceMode, RecurrenceType } from './types';
import { parseDate, parseTime } from './date-parser';
import { parseDuration } from './duration-parser';
import { validateTimeWindow, validateDependencies } from './validators';

export class TaskParser {
  /**
   * Parse task description string into structured data
   */
  static parse(input: string): ParsedTask {
    if (!input || input.trim().length === 0) {
      throw new Error('Task description cannot be empty');
    }

    const tokens = input.trim().split(/\s+/);
    const result: ParsedTask = {
      title: '',
      tags: [],
      raw: input,
    };

    let titleTokens: string[] = [];
    let i = 0;

    // Check for recurrence first
    const recurrenceResult = this.tryParseRecurrence(tokens);
    if (recurrenceResult) {
      result.recurrence = recurrenceResult.pattern;
      i = recurrenceResult.tokensConsumed;
    } else {
      // Try parsing date
      const dateResult = this.tryParseDate(tokens[0]);
      if (dateResult) {
        result.date = dateResult;
        i = 1;
      }
    }

    // Parse remaining tokens
    for (; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.startsWith('@')) {
        result.project = token.slice(1);
      } else if (token.startsWith('+')) {
        result.tags.push(token.slice(1));
      } else if (token.startsWith('~')) {
        result.duration = parseDuration(token.slice(1));
      } else if (token.startsWith('^')) {
        result.bucket = token.slice(1);
      } else if (token.startsWith('window:')) {
        result.window = this.parseWindow(token.slice(7));
      } else if (token.startsWith('after:')) {
        result.dependencies = validateDependencies(token.slice(6));
      } else {
        titleTokens.push(token);
      }
    }

    result.title = titleTokens.join(' ').trim();

    if (!result.title) {
      throw new Error('Task title is required');
    }

    return result;
  }

  /**
   * Format parsed task back to string
   */
  static format(task: ParsedTask): string {
    const parts: string[] = [];

    // Recurrence
    if (task.recurrence) {
      parts.push(this.formatRecurrence(task.recurrence));
    }

    // Date
    if (task.date && !task.recurrence) {
      parts.push(this.formatDate(task.date));
    }

    // Title
    parts.push(task.title);

    // Project
    if (task.project) {
      parts.push(`@${task.project}`);
    }

    // Tags
    task.tags.forEach(tag => parts.push(`+${tag}`));

    // Duration
    if (task.duration) {
      parts.push(this.formatDuration(task.duration));
    }

    // Bucket
    if (task.bucket) {
      parts.push(`^${task.bucket}`);
    }

    // Window
    if (task.window) {
      parts.push(`window:${task.window.start}-${task.window.end}`);
    }

    // Dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      parts.push(`after:${task.dependencies.join(',')}`);
    }

    return parts.join(' ');
  }

  private static tryParseRecurrence(tokens: string[]): { pattern: RecurrencePattern; tokensConsumed: number } | null {
    const first = tokens[0]?.toLowerCase();

    // Shorthand: daily, weekly, monthly
    if (['daily', 'weekly', 'monthly'].includes(first)) {
      return {
        pattern: {
          mode: RecurrenceMode.CALENDAR,
          type: first as RecurrenceType,
        },
        tokensConsumed: 1,
      };
    }

    // "every" pattern (calendar mode)
    if (first === 'every') {
      const second = tokens[1]?.toLowerCase();
      if (!second) {
        throw new Error('Expected weekday or interval after "every"');
      }

      // "every monday"
      const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayIndex = weekdays.indexOf(second);
      if (dayIndex !== -1) {
        return {
          pattern: {
            mode: RecurrenceMode.CALENDAR,
            type: RecurrenceType.WEEKLY,
            dayOfWeek: dayIndex,
          },
          tokensConsumed: 2,
        };
      }

      // "every 2w", "every 3d", "every 1m"
      const match = second.match(/^(\d+)(d|w|m)$/);
      if (match) {
        const interval = parseInt(match[1], 10);
        const unitMap: Record<string, 'days' | 'weeks' | 'months'> = {
          d: 'days',
          w: 'weeks',
          m: 'months',
        };
        const unit = unitMap[match[2]];

        return {
          pattern: {
            mode: RecurrenceMode.CALENDAR,
            type: RecurrenceType.INTERVAL,
            interval,
            unit,
            anchor: new Date(),
          },
          tokensConsumed: 2,
        };
      }

      throw new Error(`Invalid recurrence pattern: every ${second}`);
    }

    // "after" pattern (completion mode)
    if (first === 'after') {
      const second = tokens[1]?.toLowerCase();
      if (!second) {
        throw new Error('Expected interval after "after"');
      }

      // "after 2w", "after 30d", "after 3m"
      const match = second.match(/^(\d+)(d|w|m)$/);
      if (match) {
        const interval = parseInt(match[1], 10);
        const unitMap: Record<string, 'days' | 'weeks' | 'months'> = {
          d: 'days',
          w: 'weeks',
          m: 'months',
        };
        const unit = unitMap[match[2]];

        return {
          pattern: {
            mode: RecurrenceMode.COMPLETION,
            type: RecurrenceType.INTERVAL,
            interval,
            unit,
          },
          tokensConsumed: 2,
        };
      }

      throw new Error(`Invalid recurrence pattern: after ${second}`);
    }

    return null;
  }

  private static tryParseDate(token: string): Date | null {
    return parseDate(token);
  }

  private static parseWindow(input: string): TimeWindow {
    return validateTimeWindow(input);
  }

  private static formatRecurrence(recurrence: RecurrencePattern): string {
    if (recurrence.type === RecurrenceType.DAILY) return 'daily';
    if (recurrence.type === RecurrenceType.WEEKLY && recurrence.dayOfWeek !== undefined) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      return `every ${days[recurrence.dayOfWeek]}`;
    }
    if (recurrence.type === RecurrenceType.INTERVAL) {
      const unitMap = { days: 'd', weeks: 'w', months: 'm' };
      const unit = unitMap[recurrence.unit!];
      const prefix = recurrence.mode === RecurrenceMode.CALENDAR ? 'every' : 'after';
      return `${prefix} ${recurrence.interval}${unit}`;
    }
    return recurrence.mode === RecurrenceMode.CALENDAR ? 'weekly' : 'after 1w';
  }

  private static formatDate(date: Date): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private static formatDuration(minutes: number): string {
    if (minutes < 60) return `~${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `~${hours}h`;
    return `~${hours}h${mins}m`;
  }
}
```

## Utilities

### src/date-parser.ts
```typescript
export function parseDate(input: string): Date | null {
  // ISO format: 2025-01-03
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const date = new Date(input + 'T00:00:00');
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${input}`);
    }
    return date;
  }

  // Relative dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lower = input.toLowerCase();
  switch (lower) {
    case 'today':
      return today;
    case 'tomorrow':
      return new Date(today.getTime() + 86400000);
  }

  // Weekdays
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = weekdays.indexOf(lower);
  if (dayIndex !== -1) {
    return getNextWeekday(dayIndex);
  }

  return null;
}

function getNextWeekday(targetDay: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDay();

  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7; // Next week

  return new Date(today.getTime() + daysUntil * 86400000);
}

export function parseTime(timeStr: string): { hour: number; minute: number } {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr} (expected HH:MM)`);
  }

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);

  if (hour < 0 || hour > 23) {
    throw new Error(`Invalid hour: ${hour} (must be 0-23)`);
  }
  if (minute < 0 || minute > 59) {
    throw new Error(`Invalid minute: ${minute} (must be 0-59)`);
  }

  return { hour, minute };
}
```

### src/duration-parser.ts
```typescript
export function parseDuration(input: string): number {
  // Parse: 5m, 2h, 1h30m, 90m
  const match = input.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${input} (use Xh, Xm, or XhYm)`);
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (hours === 0 && minutes === 0) {
    throw new Error(`Duration must be greater than zero: ${input}`);
  }

  return hours * 60 + minutes;
}
```

### src/validators.ts
```typescript
import { TimeWindow } from './types';
import { parseTime } from './date-parser';

export function validateTimeWindow(input: string): TimeWindow {
  const match = input.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time window format: ${input} (expected HH:MM-HH:MM)`);
  }

  // Validate both times
  parseTime(match[1]);
  parseTime(match[2]);

  return {
    start: match[1],
    end: match[2],
  };
}

export function validateDependencies(input: string): number[] {
  const ids = input.split(',').map(s => s.trim());
  const result: number[] = [];

  for (const id of ids) {
    const num = parseInt(id, 10);
    if (isNaN(num) || num <= 0) {
      throw new Error(`Invalid dependency ID: ${id} (must be positive integer)`);
    }
    result.push(num);
  }

  if (result.length === 0) {
    throw new Error('At least one dependency ID required');
  }

  return result;
}
```

## Testing

### tests/parser.test.ts
```typescript
import { TaskParser } from '../src/parser';
import { RecurrenceMode, RecurrenceType } from '../src/types';

describe('TaskParser', () => {
  describe('basic parsing', () => {
    test('parses simple title', () => {
      const result = TaskParser.parse('Buy groceries');
      expect(result.title).toBe('Buy groceries');
      expect(result.tags).toEqual([]);
    });

    test('parses title with date', () => {
      const result = TaskParser.parse('2025-01-10 Deploy app');
      expect(result.title).toBe('Deploy app');
      expect(result.date).toEqual(new Date('2025-01-10T00:00:00'));
    });

    test('parses title with project', () => {
      const result = TaskParser.parse('Fix bug @relay');
      expect(result.title).toBe('Fix bug');
      expect(result.project).toBe('relay');
    });

    test('parses title with multiple tags', () => {
      const result = TaskParser.parse('Deploy app +urgent +backend');
      expect(result.title).toBe('Deploy app');
      expect(result.tags).toEqual(['urgent', 'backend']);
    });

    test('parses title with duration', () => {
      const result = TaskParser.parse('Meeting ~1h30m');
      expect(result.title).toBe('Meeting');
      expect(result.duration).toBe(90);
    });
  });

  describe('recurrence parsing', () => {
    test('parses calendar recurrence with weekday', () => {
      const result = TaskParser.parse('every monday Take out trash');
      expect(result.title).toBe('Take out trash');
      expect(result.recurrence).toMatchObject({
        mode: RecurrenceMode.CALENDAR,
        type: RecurrenceType.WEEKLY,
        dayOfWeek: 1,
      });
    });

    test('parses completion recurrence', () => {
      const result = TaskParser.parse('after 2w Get haircut');
      expect(result.title).toBe('Get haircut');
      expect(result.recurrence).toMatchObject({
        mode: RecurrenceMode.COMPLETION,
        type: RecurrenceType.INTERVAL,
        interval: 2,
        unit: 'weeks',
      });
    });

    test('parses daily shorthand', () => {
      const result = TaskParser.parse('daily Morning standup');
      expect(result.recurrence?.type).toBe(RecurrenceType.DAILY);
    });
  });

  describe('error handling', () => {
    test('throws on empty input', () => {
      expect(() => TaskParser.parse('')).toThrow('cannot be empty');
    });

    test('throws on missing title', () => {
      expect(() => TaskParser.parse('@project +tag')).toThrow('title is required');
    });

    test('throws on invalid duration', () => {
      expect(() => TaskParser.parse('Task ~2.5h')).toThrow('Invalid duration');
    });
  });
});
```

## README.md

```markdown
# @kevjava/task-parser

Shared task description grammar parser for churn and tt-time-tracker.

## Installation

```bash
npm install @kevjava/task-parser
```

## Usage

```typescript
import { TaskParser } from '@kevjava/task-parser';

// Parse task description
const parsed = TaskParser.parse('2025-01-10 Deploy app @relay +urgent ~2h');

console.log(parsed.title);      // "Deploy app"
console.log(parsed.date);       // Date object
console.log(parsed.project);    // "relay"
console.log(parsed.tags);       // ["urgent"]
console.log(parsed.duration);   // 120 (minutes)

// Format back to string
const formatted = TaskParser.format(parsed);
console.log(formatted);
// "2025-01-10 Deploy app @relay +urgent ~2h"
```

## Grammar

See [grammar documentation](https://github.com/kevjava/churn/blob/main/docs/01-grammar.md) for complete syntax reference.

## License

MIT
```

## Implementation Checklist

- [ ] Set up repository structure
- [ ] Configure package.json, tsconfig, jest
- [ ] Implement type definitions
- [ ] Implement TaskParser.parse()
- [ ] Implement date parsing utilities
- [ ] Implement duration parsing
- [ ] Implement validators
- [ ] Implement TaskParser.format()
- [ ] Write unit tests (aim for 80%+ coverage)
- [ ] Write edge case tests
- [ ] Document all public methods
- [ ] Create README with examples
- [ ] Publish to npm
