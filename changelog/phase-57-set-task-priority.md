# Phase 57: Set Task Priority MCP Tool

## 概览
| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 添加 set_task_priority MCP 工具，填补字段 setter 不对称缺口 |
| 涉及文件 | 6 个 |
| 新增行数 | ~120 行 |
| 删除行数 | 0 行 |

## 逐文件改动

### 1. src/server/tasks/store.ts
**改动**: 新增 `setTaskPriority` 接口声明和实现

**改前** (接口, line 66):
```typescript
setTaskDescription(taskId: string, description: string | null): Promise<Task>;
listOverdueTasks(): Promise<Task[]>;
```

**改后**:
```typescript
setTaskDescription(taskId: string, description: string | null): Promise<Task>;
setTaskPriority(taskId: string, priority: TaskPriority): Promise<Task>;
listOverdueTasks(): Promise<Task[]>;
```

**改前** (实现, 无):
```typescript
// 不存在
```

**改后** (实现, line ~1245):
```typescript
async setTaskPriority(taskId: string, priority: TaskPriority): Promise<Task> {
  const VALID_PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];
  if (!VALID_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid priority: ${priority}. Must be one of: ${VALID_PRIORITIES.join(", ")}`);
  }
  const row = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error(`Task not found: ${taskId}`);
  }
  const now = new Date().toISOString();
  db.prepare(`UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?`).run(priority, now, taskId);
  const updated = selectTaskById.get(taskId) as Record<string, unknown>;
  return rowToTask(updated);
}
```

**原因**: Task 有 priority 字段但没有独立的 setter 工具。已有 set_task_due_date、set_task_reminder、set_task_description，唯独缺 set_task_priority。

**影响**: 允许 AI 代理通过 MCP 协议独立设置任务优先级。

### 2. src/server/tasks/routes.ts
**改动**: 新增 `POST /api/tasks/:id/priority` 路由

**改前** (line 1925-1927):
```typescript
  });

  // POST /api/tasks/reset-stale - reset stale tasks (requires tasks.reset_stale)
```

**改后**:
```typescript
  });

  // POST /api/tasks/:id/priority - set priority (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { priority: string };
  }>("/api/tasks/:id/priority", async (req, reply) => {
    // ... auth, validation, store call
  });

  // POST /api/tasks/reset-stale - reset stale tasks (requires tasks.reset_stale)
```

**原因**: 提供 HTTP API 端点供 MCP 客户端调用。

**影响**: 新增 REST API 端点，需要 tasks.write 权限。

### 3. src/mcp-server/client.ts
**改动**: 新增 `setPriority` 客户端方法

**改前** (接口, line 35):
```typescript
setTaskDescription(taskId: string, description: string | null): Promise<Task>;
listOverdueTasks(): Promise<Task[]>;
```

**改后**:
```typescript
setTaskDescription(taskId: string, description: string | null): Promise<Task>;
setPriority(taskId: string, priority: TaskPriority): Promise<Task>;
listOverdueTasks(): Promise<Task[]>;
```

新增 TaskPriority 导入和实现方法。

**原因**: MCP 客户端需要调用新 API 端点。

### 4. src/mcp-server/tools.ts
**改动**: 新增 `set_task_priority` MCP 工具注册

**改前** (line 690-692):
```typescript
  );

  // list_overdue_tasks tool
```

**改后**:
```typescript
  );

  // set_task_priority tool
  server.registerTool(
    "set_task_priority",
    {
      description: "Set the priority of a task. Priority affects task ordering...",
      inputSchema: {
        taskId: z.string().describe("The task ID to set the priority for"),
        priority: z.enum(["low", "normal", "high", "urgent"]).describe("..."),
      },
    },
    async (args) => { /* ... */ },
  );

  // list_overdue_tasks tool
```

**原因**: AI 代理需要通过 MCP 协议设置任务优先级。

### 5. test/mcp-server/tools.test.ts
**改动**: 新增 mock 方法、更新工具计数、新增测试

- 新增 `setPriority` mock 方法
- 工具计数从 115 → 116
- 新增 4 个测试用例

### 6. FEATURES.md
**改动**: 新增 Phase 57 条目，标记所有项为 `[x]`

## 风险说明
- **低风险**: 完全遵循已有 setter 模式（set_task_due_date 等），无新架构引入
- **向后兼容**: 新增 API 端点和 MCP 工具，不影响现有功能
- **验证**: typecheck ✅, build ✅, 442 tests all pass ✅

## 验证步骤
```bash
cd /opt/harness-remote
npm run typecheck  # ✅ 通过
npm run build      # ✅ 通过
npm test           # ✅ 442 tests passed
```
