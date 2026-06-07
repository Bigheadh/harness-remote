# Phase 52: Time Entry Management

## 概览
| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-07 |
| 功能 | 时间记录管理（手动日志 + 计时器） |
| 涉及文件数 | 5 |
| 新增行数 | ~230 |
| 删除行数 | 0 |

## 逐文件改动

### 1. `src/server/tasks/store.ts`
**改动类型**: 接口扩展 + 实现新增

**接口新增** (TaskStore interface):
```typescript
// 新增 5 个方法签名
createTimeEntry(taskId: string, startedAt: string, endedAt: string | undefined, durationMinutes: number, description: string | null, loggedBy: string): Promise<TimeEntry>;
listTimeEntries(taskId: string): Promise<TimeEntry[]>;
getTimeEntry(taskId: string, entryId: string): Promise<TimeEntry | undefined>;
deleteTimeEntry(taskId: string, entryId: string): Promise<boolean>;
stopTimeEntry(taskId: string, entryId: string, endedAt: string): Promise<TimeEntry>;
```

**辅助函数新增**:
- `rowToTimeEntry(row)` — 将 SQLite 行转换为 TimeEntry 对象

**实现新增** (createTaskStore 返回对象内):
- `createTimeEntry` — INSERT INTO time_entries，使用 lastInsertRowid 作为 ID
- `listTimeEntries` — SELECT 按 started_at DESC 排序
- `getTimeEntry` — SELECT by task_id + id
- `deleteTimeEntry` — DELETE by task_id + id
- `stopTimeEntry` — UPDATE ended_at + 计算 duration_minutes，验证未停止状态

**修改原因**: time_entries 表和 TimeEntry 类型已存在但从未连接，实现了完整的 CRUD + 计时器功能。

### 2. `src/server/tasks/routes.ts`
**改动类型**: 新增路由

新增 5 个路由端点:
- `GET /api/tasks/:id/time-entries` — 列出任务的所有时间记录
- `POST /api/tasks/:id/time-entries` — 记录时间（手动或计时）
- `POST /api/tasks/:id/time-entries/start` — 启动计时器
- `POST /api/tasks/:id/time-entries/stop` — 停止计时器（自动计算时长）
- `DELETE /api/tasks/:id/time-entries/:entryId` — 删除时间记录

每个路由遵循现有的 auth + authorize 模式，使用 `authCtx.user?.id` 作为 loggedBy 默认值。

### 3. `src/mcp-server/client.ts`
**改动类型**: 接口扩展 + 实现新增

**TaskApiClient 接口新增**:
```typescript
listTimeEntries(taskId: string): Promise<TimeEntry[]>;
createTimeEntry(taskId: string, opts: { startedAt?: string; endedAt?: string; durationMinutes?: number; description?: string; loggedBy?: string }): Promise<TimeEntry>;
startTimeEntry(taskId: string, description?: string): Promise<TimeEntry>;
stopTimeEntry(taskId: string, entryId: string): Promise<TimeEntry>;
deleteTimeEntry(taskId: string, entryId: string): Promise<void>;
```

**HTTP 客户端实现**: 对应调用新增的 API 路由。

### 4. `src/mcp-server/tools.ts`
**改动类型**: 新增 5 个 MCP 工具

| 工具名 | 功能 |
|--------|------|
| `list_time_entries` | 列出任务的所有时间记录，返回总时长 |
| `log_time_entry` | 记录时间（支持手动时长或时间戳计算） |
| `start_time_tracking` | 启动任务计时器 |
| `stop_time_tracking` | 停止计时器，自动计算时长 |
| `delete_time_entry` | 删除时间记录 |

### 5. `test/mcp-server/tools.test.ts`
**改动类型**: Mock 扩展 + 测试新增

- Mock client 新增 5 个方法实现
- 工具数量断言更新: 108 → 113
- 新增 15 个测试用例（每个工具 2-4 个测试：注册验证、正常调用、错误处理）

### 6. `FEATURES.md`
**改动类型**: 新增 Phase 52 追踪条目

## 结构性摘要
- **新增**: 5 个 store 方法 + 5 个 API 路由 + 5 个 client 方法 + 5 个 MCP 工具 + 15 个测试
- **无删除**: 所有改动为纯增量
- **重构**: 无

## 风险说明
- **低风险**: 所有改动为纯增量，不修改现有功能
- **DB 迁移**: time_entries 表已存在（Phase 49 创建），无需新迁移
- **路由冲突**: `/api/tasks/:id/time-entries/start` 和 `/stop` 为静态路径，不会被 `/:entryId` 参数化路由错误匹配

## 验证步骤
- [x] `npm run typecheck` 通过
- [x] `npm run build` 通过
- [x] `npx vitest run` 全部 412 个测试通过（含 15 个新测试）
