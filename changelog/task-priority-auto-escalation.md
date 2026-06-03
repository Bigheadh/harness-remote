# Task Priority Auto-Escalation

## 概览

| 日期 | 任务 | 涉及文件数 | 新增行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-03 | 任务优先级自动升级 — 自动升级过期任务的优先级 | 7 | ~85 | ~2 |

## 改动文件

### 1. src/shared/types.ts

**改动 1**: 新增 `task.priority_escalated` 审计动作类型

- **位置**: 第 136 行附近 (AuditAction 联合类型)
- **改前**: `| "task.subtask_deleted";`
- **改后**: `| "task.subtask_deleted" | "task.priority_escalated";`
- **原因**: 审计日志需要记录优先级升级事件
- **影响**: AuditAction 联合类型扩展，审计日志系统可记录新事件类型

### 2. src/server/tasks/store.ts

**改动 1**: TaskStore 接口新增 `escalateOverduePriorities` 方法签名

- **位置**: 第 148-149 行 (TaskStore 接口末尾)
- **改前**: 接口以 `listArchivedTasks` 结尾
- **改后**: 新增 `escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }>`
- **原因**: 定义优先级升级的存储层契约
- **影响**: 所有 TaskStore 实现必须提供此方法

**改动 2**: TaskStore 实现中新增 `escalateOverduePriorities` 方法

- **位置**: 第 2640-2675 行 (store 返回对象末尾)
- **改前**: store 返回对象以 `listArchivedTasks` 结尾
- **改后**: 新增完整方法实现
- **原因**: 核心业务逻辑 — 查询过期任务，逐级升级优先级
- **影响**: 
  - 查询条件: `due_date < now AND status IN (pending, picked, running) AND archived_at IS NULL`
  - 优先级梯度: low → normal → high → urgent（urgent 不变）
  - 每个升级的任务都会更新 `updated_at` 时间戳
  - 返回升级数量和升级后的任务列表

### 3. src/server/tasks/routes.ts

**改动 1**: 新增 `task.priority_escalated` 审计日志摘要格式

- **位置**: 第 73-74 行 (formatAuditSummary 函数)
- **改前**: `case "task.subtask_deleted"` 后直接 `case "task.reset_stale"`
- **改后**: 中间新增 `case "task.priority_escalated": return \`Priority escalated for ${details?.count ?? 0} overdue task(s)\``
- **原因**: 活动流需要显示可读的优先级升级描述
- **影响**: 活动流时间线中会显示升级摘要

**改动 2**: 新增 `POST /api/tasks/escalate-priorities` API 端点

- **位置**: 第 738-773 行 (GET /api/tasks/archived 之后，GET /api/tasks/:id 之前)
- **改前**: 无此路由
- **改后**: 完整路由处理函数
- **原因**: 提供 HTTP 触发优先级升级的接口
- **影响**: 
  - 需要 `tasks.write` 权限
  - 升级后记录审计日志（含升级数量和任务 ID 列表）
  - 返回 `{ ok: true, escalated: N, tasks: [...] }`
  - 路由注册在 `:id` 参数路由之前，避免路径匹配冲突

### 4. src/mcp-server/client.ts

**改动 1**: TaskApiClient 接口新增 `escalateOverduePriorities` 方法签名

- **位置**: 第 101-102 行
- **改前**: 接口以 `listArchivedTasks` 结尾
- **改后**: 新增 `escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }>`
- **原因**: MCP 客户端需要调用优先级升级 API

**改动 2**: TaskApiClient 实现中新增 `escalateOverduePriorities` 方法

- **位置**: 第 1142-1157 行
- **改前**: 无此方法
- **改后**: POST 到 `/api/tasks/escalate-priorities`，返回升级结果
- **原因**: MCP 工具需要通过 HTTP 客户端调用服务器端点

### 5. src/mcp-server/tools.ts

**改动 1**: 新增 `escalate_overdue_priorities` MCP 工具

- **位置**: 第 2757-2797 行 (文件末尾)
- **改前**: 无此工具
- **改后**: 完整工具注册，无输入参数
- **原因**: Codex CLI 可通过 MCP 工具触发优先级升级
- **影响**: 
  - 工具无需参数（自动扫描所有过期任务）
  - 返回升级数量和任务列表
  - 工具总数从 64 增加到 65

### 6. test/mcp-server/tools.test.ts

**改动 1**: 更新工具数量断言

- **位置**: 第 1035-1036 行
- **改前**: `"registers all 64 tools"` + `toHaveLength(64)`
- **改后**: `"registers all 65 tools"` + `toHaveLength(65)`
- **原因**: 新增了 escalate_overdue_priorities 工具
- **影响**: 测试断言与实际工具数量保持一致

### 7. FEATURES.md

**改动 1**: 标记优先级自动升级为已完成

- **位置**: 第 174 行
- **改前**: `- [ ] Task priority auto-escalation`
- **改后**: `- [x] Task priority auto-escalation`
- **原因**: 功能已实现并通过所有验证

## 结构性摘要

- **新增**: 1 个 store 方法（escalateOverduePriorities）
- **新增**: 1 个 API 端点（POST /api/tasks/escalate-priorities）
- **新增**: 1 个 MCP 工具（escalate_overdue_priorities）
- **新增**: 1 个审计事件类型（task.priority_escalated）
- **更新**: 审计日志摘要格式（支持 priority_escalated）
- **更新**: MCP 工具总数（64 → 65）

## 风险说明

- **低风险**: 新功能为纯增量，不修改现有逻辑
- **注意**: 升级操作是幂等的 — 对同一过期任务多次调用只会升级一次（因为 urgent 是上限）
- **注意**: 不影响非过期任务，不影响已完成/失败的任务

## 验证步骤

- [x] `npm run typecheck` — 通过
- [x] `npm run build` — 通过
- [x] `npm run test` — 261/261 通过
- [ ] 手动测试: 创建一个过期任务，调用 POST /api/tasks/escalate-priorities，验证优先级从 normal 升级到 high
- [ ] 手动测试: 创建一个 urgent 过期任务，验证不会被修改
