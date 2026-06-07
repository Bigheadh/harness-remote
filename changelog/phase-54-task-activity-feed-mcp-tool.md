# Phase 54: Task Activity Feed MCP Tool

**Date**: 2026-06-07
**Feature**: Wrap the existing `GET /api/tasks/:id/activity` endpoint as an MCP tool

## 概览

| 指标 | 数值 |
|------|------|
| 涉及文件数 | 3 |
| 新增行数 | ~70 |
| 删除行数 | 0 |
| 风险等级 | 低 |

## 逐文件改动

### 1. `src/mcp-server/client.ts`

**改动位置**: 接口声明 + 实现

**改前**: `TaskApiClient` 接口以 `getTimeTrackingStats()` 结尾，无 `getActivityFeed` 方法

**改后**:
- 在接口中新增 `getActivityFeed(taskId: string, limit?: number): Promise<ActivityFeedItem[]>`
- 在 `createTaskApiClient` 实现中新增 HTTP GET 方法，调用 `/api/tasks/:id/activity` 端点
- 支持可选 `limit` 查询参数

**原因**: API 路由 `GET /api/tasks/:id/activity` 已存在，返回合并的任务活动时间线（创建、状态变更、评论、备注、子任务事件等），但没有对应的 MCP 客户端方法，AI 代理无法通过 MCP 协议查询任务活动历史

**影响范围**: 仅新增客户端方法，不影响现有功能

### 2. `src/mcp-server/tools.ts`

**改动位置**: 文件末尾，最后一个工具注册之后

**改前**: 文件以 `get_time_tracking_stats` 工具注册结束

**改后**:
- 新增 `get_task_activity` 工具注册
- inputSchema: `taskId` (必填), `limit` (可选, 默认 50, 最大 200)
- 调用 `client.getActivityFeed()` 获取合并的活动时间线
- 返回 `{ items, count }` JSON 响应
- 包含完整的错误处理

**原因**: AI 代理需要通过 MCP 协议查看任务的完整活动历史，以了解任务的演变过程和审计轨迹

**影响范围**: 新增 1 个 MCP 工具（114 → 115）

### 3. `test/mcp-server/tools.test.ts`

**改动位置**: mock client + tool count + 新测试

**改前**: 工具数 114，无 `getActivityFeed` mock 方法

**改后**:
- Mock client 新增 `getActivityFeed` 方法，返回 2 条模拟活动记录
- 工具计数从 114 更新为 115
- 新增 4 个测试用例:
  1. 工具注册验证（描述、inputSchema）
  2. 返回活动条目（验证 items 和 count）
  3. 客户端调用参数验证（taskId, limit）
  4. 错误处理（Task not found）

**原因**: 确保新工具的注册、调用、错误处理都经过测试覆盖

**影响范围**: 测试数从 420 增加到 424

## 结构性摘要

- **新增**: MCP 客户端方法 `getActivityFeed`、MCP 工具 `get_task_activity`、4 个测试用例
- **修改**: 工具计数 114 → 115
- **删除**: 无

## 风险说明

- **风险**: 极低。纯新增功能，不修改任何现有代码路径
- **回滚**: 删除新增的接口方法、实现、工具注册和测试即可

## 验证步骤

1. `npm run typecheck` — ✅ 通过
2. `npm run build` — ✅ 通过
3. `npm test` — ✅ 424/424 通过
4. 工具注册数: 115 ✅
