# Phase 63: Cycle (Sprint) Management MCP Tools

## 概览

| 项目 | 详情 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 为 Cycle（冲刺）子系统添加 MCP 工具 |
| 涉及文件数 | 3 |
| 新增行数 | ~310 行 |
| 删除行数 | 0 行 |
| 风险等级 | 低 |

## 问题背景

Cycle（冲刺）子系统已有完整的 API 路由（8 个端点）和 MCP 客户端方法（8 个），但缺少对应的 MCP 工具注册。AI 代理无法通过 MCP 协议管理冲刺，只能通过 HTTP API 直接调用。这属于 **gap pattern #7：API routes without MCP tools**。

## 逐文件改动

### 1. `src/mcp-server/tools.ts` — 新增 8 个 MCP 工具注册

**位置**：文件末尾 `}` 之前（原第 5037 行）

**改动内容**：新增 8 个 `server.registerTool()` 调用：

| 工具名 | 功能 | 输入参数 |
|--------|------|----------|
| `list_cycles` | 列出所有冲刺，可按状态筛选 | `status?` |
| `get_cycle` | 获取冲刺详情 | `cycleId` |
| `create_cycle` | 创建新冲刺 | `name`, `startDate`, `endDate`, `description?` |
| `update_cycle` | 更新冲刺属性 | `cycleId`, `name?`, `description?`, `startDate?`, `endDate?`, `status?` |
| `delete_cycle` | 永久删除冲刺 | `cycleId` |
| `add_task_to_cycle` | 将任务分配到冲刺 | `taskId`, `cycleId` |
| `remove_task_from_cycle` | 将任务从冲刺中移除 | `taskId` |
| `list_cycle_tasks` | 列出冲刺中的所有任务 | `cycleId` |

**修改原因**：补全 cycle 子系统的 MCP 工具层，使 AI 代理可以完整管理冲刺周期。

**影响范围**：仅新增代码，不修改现有逻辑。工具层直接调用已有的 `TaskApiClient` 方法。

### 2. `test/mcp-server/tools.test.ts` — Mock 客户端 + 测试 + 计数更新

**改动 a**：Mock 客户端新增 8 个 cycle 方法（第 1660 行后）

```typescript
async listCycles(status?) — 返回 CycleSummary[]
async getCycle(cycleId) — 返回 CycleSummary
async createCycle(data) — 返回 Cycle
async updateCycle(cycleId, updates) — 返回 Cycle
async deleteCycle(cycleId) — 返回 void
async addTaskToCycle(taskId, cycleId) — 返回 Task
async removeTaskFromCycle(taskId) — 返回 Task
async listCycleTasks(cycleId) — 返回 Task[]
```

**改动 b**：工具计数断言从 `124` 更新为 `132`

**改动 c**：新增 8 个 `describe()` 测试块，共 25 个测试用例：
- `list_cycles`：注册检查、数据返回、状态筛选传递、错误处理（4 个）
- `get_cycle`：注册检查、数据返回、错误处理（3 个）
- `create_cycle`：注册检查、创建调用、参数验证、错误处理（3 个）
- `update_cycle`：注册检查、更新调用、参数验证、错误处理（3 个）
- `delete_cycle`：注册检查、删除调用、错误处理（3 个）
- `add_task_to_cycle`：注册检查、添加调用、错误处理（3 个）
- `remove_task_from_cycle`：注册检查、移除调用、错误处理（3 个）
- `list_cycle_tasks`：注册检查、任务列表、错误处理（3 个）

**修改原因**：验证新工具的注册、参数传递和错误处理行为。Mock 客户端需要实现新增的接口方法以满足 TypeScript 编译。

### 3. `FEATURES.md` — 新增 Phase 63 条目

新增 `## Phase 63: Cycle (Sprint) Management MCP Tools` 章节，标记所有 11 个子项为 `[x]`。

## 结构性摘要

- **新增**：8 个 MCP 工具注册（`list_cycles`, `get_cycle`, `create_cycle`, `update_cycle`, `delete_cycle`, `add_task_to_cycle`, `remove_task_from_cycle`, `list_cycle_tasks`）
- **新增**：8 个 mock 客户端方法
- **新增**：25 个测试用例
- **更新**：工具计数断言 124 → 132
- **更新**：FEATURES.md 追踪器

## 风险说明

- **风险等级**：低
- **原因**：所有改动均为纯新增代码，不修改任何现有逻辑。工具层直接调用已有的 `TaskApiClient` 方法，这些方法已经过充分测试。
- **潜在影响**：无。不会影响现有工具或功能。

## 验证步骤

- [x] `npm run typecheck` — 通过
- [x] `npm run build` — 通过
- [x] `npm test` — 489/489 测试通过（原 464，新增 25）
- [x] 工具计数：132 个注册（原 124，新增 8）
