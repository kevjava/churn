# Dependencies Specification

## Overview

Tasks can depend on other tasks. Dependencies block task execution until all prerequisite tasks are complete.

## Dependency Rules

1. A task cannot start until all its dependencies are complete
2. Circular dependencies are not allowed
3. Dependencies must exist when created
4. Deleting a task with dependents requires confirmation

## Data Model

Dependencies stored as JSON array in `tasks.dependencies`:
```sql
dependencies TEXT NOT NULL DEFAULT '[]'
```

Example:
```json
[143, 144, 145]
```

## Validation

### Circular Dependency Detection

```typescript
export function validateDependencies(
  taskId: number,
  proposedDeps: number[],
  allTasks: Task[]
): void {
  // Check each dependency exists
  for (const depId of proposedDeps) {
    const task = allTasks.find(t => t.id === depId);
    if (!task) {
      throw new Error(`Dependency task ${depId} not found`);
    }
  }
  
  // Check for circular dependencies
  if (hasCircularDependency(taskId, proposedDeps, allTasks)) {
    throw new Error('Circular dependency detected');
  }
}

export function hasCircularDependency(
  taskId: number,
  dependencies: number[],
  allTasks: Task[]
): boolean {
  const visited = new Set<number>();
  const queue = [...dependencies];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Found cycle back to original task
    if (current === taskId) {
      return true;
    }
    
    // Already checked this task
    if (visited.has(current)) {
      continue;
    }
    
    visited.add(current);
    
    // Add this task's dependencies to queue
    const task = allTasks.find(t => t.id === current);
    if (task?.dependencies && task.dependencies.length > 0) {
      queue.push(...task.dependencies);
    }
  }
  
  return false;
}
```

### Example Validations

**Valid dependency chain:**
```
Task A → Task B → Task C
```

**Invalid circular dependency:**
```
Task A → Task B → Task C → Task A
```

**Self-dependency (invalid):**
```
Task A → Task A
```

## Dependency Resolution

### Checking Completion Status

```typescript
export async function allDependenciesComplete(
  dependencies: number[],
  taskService: TaskService
): Promise<boolean> {
  if (dependencies.length === 0) {
    return true;
  }
  
  for (const depId of dependencies) {
    const task = await taskService.get(depId);
    if (!task) {
      throw new Error(`Dependency task ${depId} not found`);
    }
    if (task.status !== TaskStatus.COMPLETED) {
      return false;
    }
  }
  
  return true;
}
```

### Getting Dependency Tree

```typescript
export async function getDependencyTree(
  taskId: number,
  taskService: TaskService
): Promise<DependencyTree> {
  const task = await taskService.get(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  const children: DependencyTree[] = [];
  
  if (task.dependencies && task.dependencies.length > 0) {
    for (const depId of task.dependencies) {
      const childTree = await getDependencyTree(depId, taskService);
      children.push(childTree);
    }
  }
  
  return {
    task,
    children,
    blocked: children.some(c => c.blocked || c.task.status !== TaskStatus.COMPLETED),
  };
}

interface DependencyTree {
  task: Task;
  children: DependencyTree[];
  blocked: boolean;
}
```

## Automatic Status Updates

### When Dependency Completes

```typescript
export async function onTaskComplete(
  completedTaskId: number,
  taskService: TaskService
): Promise<void> {
  // Find tasks that depend on this one
  const dependents = await taskService.getDependents(completedTaskId);
  
  for (const dependent of dependents) {
    // Check if all its dependencies are now complete
    const allComplete = await allDependenciesComplete(
      dependent.dependencies,
      taskService
    );
    
    // If was blocked and now unblocked, update status
    if (dependent.status === TaskStatus.BLOCKED && allComplete) {
      await taskService.update(dependent.id, {
        status: TaskStatus.OPEN,
      });
    }
  }
}
```

### When Task Created/Updated

```typescript
export async function updateDependencyStatus(
  taskId: number,
  taskService: TaskService
): Promise<void> {
  const task = await taskService.get(taskId);
  if (!task) return;
  
  if (!task.dependencies || task.dependencies.length === 0) {
    // No dependencies, should be open
    if (task.status === TaskStatus.BLOCKED) {
      await taskService.update(taskId, {
        status: TaskStatus.OPEN,
      });
    }
    return;
  }
  
  // Has dependencies, check if blocked
  const allComplete = await allDependenciesComplete(
    task.dependencies,
    taskService
  );
  
  if (!allComplete && task.status !== TaskStatus.BLOCKED) {
    await taskService.update(taskId, {
      status: TaskStatus.BLOCKED,
    });
  } else if (allComplete && task.status === TaskStatus.BLOCKED) {
    await taskService.update(taskId, {
      status: TaskStatus.OPEN,
    });
  }
}
```

## CLI Display

### Showing Dependencies

```bash
churn show 148
```

Output:
```
Task #148: Deploy to production

Dependencies:
  #143 [done] Testing complete
  #144 [done] Security review
  
Status: open (unblocked)
```

### Showing Dependents

```
Task #143: Testing complete

Dependents:
  #148 Deploy to production (blocked by #144)
```

### Dependency Tree

```bash
churn deps 150
```

Output:
```
#150 Launch website
 ├─ #148 Deploy to production
 │   ├─ #143 Testing complete [done]
 │   └─ #144 Security review [done]
 └─ #149 Marketing materials
     └─ #147 Final copy review [open]
     
Status: blocked (waiting on #147)
```

## Error Messages

```
Error: Cannot create task
  Circular dependency detected:
  Task #143 → #144 → #145 → #143
  
Error: Cannot delete task #143
  Task has dependents:
    #148 Deploy to production
    #150 Launch website
  Complete or update these tasks first, or use --force
```

## Testing

### Test Cases

```typescript
describe('Dependencies', () => {
  test('detects simple circular dependency', () => {
    const tasks = [
      { id: 1, dependencies: [2] },
      { id: 2, dependencies: [1] },
    ];
    
    expect(() => validateDependencies(1, [2], tasks))
      .toThrow('Circular dependency');
  });
  
  test('detects complex circular dependency', () => {
    const tasks = [
      { id: 1, dependencies: [2] },
      { id: 2, dependencies: [3] },
      { id: 3, dependencies: [1] },
    ];
    
    expect(() => validateDependencies(1, [2], tasks))
      .toThrow('Circular dependency');
  });
  
  test('allows valid chain', () => {
    const tasks = [
      { id: 1, dependencies: [2] },
      { id: 2, dependencies: [3] },
      { id: 3, dependencies: [] },
    ];
    
    expect(() => validateDependencies(1, [2], tasks))
      .not.toThrow();
  });
  
  test('unblocks dependent when dependency completes', async () => {
    const task148 = await createTask({
      title: 'Deploy',
      dependencies: [143],
    });
    
    expect(task148.status).toBe(TaskStatus.BLOCKED);
    
    await completeTask(143);
    
    const updated = await getTask(148);
    expect(updated.status).toBe(TaskStatus.OPEN);
  });
});
```

## Implementation Checklist

- [ ] Implement validateDependencies()
- [ ] Implement circular dependency detection
- [ ] Implement allDependenciesComplete()
- [ ] Implement getDependencyTree()
- [ ] Implement automatic status updates
- [ ] Handle completion cascades
- [ ] Implement CLI display
- [ ] Add delete protection
- [ ] Write unit tests
- [ ] Write integration tests
