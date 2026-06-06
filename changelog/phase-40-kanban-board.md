# Phase 40: Kanban Board View

## 概览

| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-06 |
| 任务 | 添加看板视图 (Kanban Board) — 任务按状态分组的可视化面板 |
| 涉及文件数 | 7 |
| 参考项目 | Plane (50k⭐), Linear, ClickUp — 主流任务管理工具的核心视图 |

## 逐文件改动

### 1. src/shared/types.ts

**改动**: 新增 `KanbanColumn` 和 `KanbanBoard` 接口

**改前**: 文件结束于 `TaskStats` 接口 (line 492)

**改后**:
```typescript
export interface KanbanColumn {
  status: TaskStatus;
  label: string;
  count: number;
  tasks: Task[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  totalTasks: number;
}
```

**原因**: 定义看板视图的数据结构，供 store、routes、client、tools 各层使用

**影响**: 所有依赖 `shared/types.ts` 的模块可引用新类型

**风险**: 低 — 纯类型定义，无运行时影响

---

### 2. src/server/tasks/store.ts

**改动**: TaskStore 接口新增 `getKanbanBoard()` 方法 + 实现

**改前**: TaskStore 接口结束于 `escalateOverduePriorities()` (line 155-156)

**改后**:
```typescript
// 接口新增
getKanbanBoard(limit?: number, deviceId?: string): Promise<KanbanBoard>;

// 实现：按 5 种状态分组查询，每列按 pinned → priority → created_at DESC 排序
async getKanbanBoard(limit?, deviceId?) {
  for (const status of STATUSES) {
    // WHERE status = ? AND archived_at IS NULL
    // ORDER BY pinned DESC, CASE priority ... END, created_at DESC
    // LIMIT perColumnLimit
  }
  return { columns, totalTasks };
}
```

**原因**: 后端核心逻辑 — 一次性查询所有状态的任务并分组返回

**影响**: 新增 API 端点的数据源

**风险**: 低 — 复用现有 SELECT 查询模式，无新表/列

---

### 3. src/server/tasks/routes.ts

**改动**: 新增 `GET /api/tasks/kanban` 路由

**改前**: 搜索路由后直接是 overdue 路由 (line 463-465)

**改后**: 在 search 和 overdue 之间插入 kanban 路由
```typescript
server.get("/api/tasks/kanban", async (req, reply) => {
  // 鉴权: tasks.read
  // 参数: limit?, deviceId?
  const board = await store.getKanbanBoard(limit, deviceId);
  return reply.send(board);
});
```

**原因**: 提供 HTTP API 供 Dashboard 和 MCP 客户端调用

**影响**: 新增端点，不影响现有路由

**风险**: 低 — 静态路由，已正确注册在 `:id` 参数化路由之前

---

### 4. src/mcp-server/client.ts

**改动**: TaskApiClient 接口新增 `getKanbanBoard()` + 实现

**改前**: 接口结束于 `escalateOverduePriorities` (line 109)

**改后**:
```typescript
getKanbanBoard(limit?: number, deviceId?: string): Promise<KanbanBoard>;

async getKanbanBoard(limit?, deviceId?) {
  // GET /api/tasks/kanban?limit=...&deviceId=...
}
```

**原因**: MCP 客户端调用 HTTP API 获取看板数据

**影响**: AI 代理可通过 MCP 协议查询看板状态

**风险**: 低

---

### 5. src/mcp-server/tools.ts

**改动**: 新增 `get_kanban_board` MCP 工具注册

**改前**: 最后一个工具是 `list_webhook_deliveries` (line 3216-3261)

**改后**: 新增工具
```typescript
server.registerTool("get_kanban_board", {
  description: "Get a Kanban board view of tasks grouped by status...",
  inputSchema: { limit?: number, deviceId?: string },
}, async (args) => {
  const board = await client.getKanbanBoard(limit, deviceId);
  return { content: [{ type: "text", text: JSON.stringify(board, null, 2) }] };
});
```

**原因**: 让 AI 代理（如 Codex CLI）可以查询看板状态，了解任务工作流分布

**影响**: MCP 工具总数 75 → 76

**风险**: 低

---

### 6. src/server/dashboard/templates/dashboard.ts

**改动**: Dashboard 新增 Kanban 标签页

**改前**: 3 个标签页 (Tasks, Analytics, Settings)

**改后**: 4 个标签页 (Tasks, Analytics, **Kanban**, Settings)

新增内容:
- CSS: `.kanban-board`, `.kanban-column`, `.kanban-card` 等样式
- HTML: `<div id="kanbanView">` 面板
- JS: `loadKanban()` 和 `renderKanban()` 函数
- `switchView()` 函数更新支持 'kanban' 视图

**原因**: 提供可视化看板界面，用户可直观查看任务按状态分组的分布

**影响**: Dashboard 新增第 4 个视图

**风险**: 低 — 纯前端改动，不影响后端

---

### 7. test/mcp-server/tools.test.ts + test/server/tasks.store.test.ts

**改动**: 新增 8 个测试

**tools.test.ts**:
- 更新 mock client: 新增 `getKanbanBoard()` mock
- 更新工具计数: 75 → 76
- 新增测试: 注册检查、列结构验证、参数传递、错误处理

**tasks.store.test.ts**:
- 新增测试: 5 列结构、状态分组、limit 限制、归档排除

**改前**: 283 tests passing
**改后**: 291 tests passing (+8)

## 结构性摘要

- **新增**: KanbanColumn/KanbanBoard 类型, getKanbanBoard store 方法, /api/tasks/kanban 路由, get_kanban_board MCP 工具, Dashboard Kanban 视图
- **修改**: TaskStore 接口, TaskApiClient 接口, switchView 函数, 工具计数断言

## 风险说明

- **低风险**: 所有改动遵循现有分层架构模式，无新依赖、无新表/列、无破坏性变更
- **向后兼容**: 新增端点和工具，不影响现有 API

## 验证步骤

```bash
npm run typecheck   # ✅ 通过
npm run build       # ✅ 通过
npm test            # ✅ 291 tests passing (11 files)
```
