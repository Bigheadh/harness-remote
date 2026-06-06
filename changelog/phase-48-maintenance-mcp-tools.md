# Change Log: Phase 48 — Maintenance MCP Tools (Stale Task Reset & Event Cleanup)

## 概览

| 日期 | 任务 | 涉及文件数 | 增加行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-07 | 为 2 个已有 API 路由添加 MCP 工具 | 4 | ~140 | ~2 |

## 改动详情

### 1. `src/mcp-server/client.ts`

**改前** (line 152): `deleteSavedView(viewId: string): Promise<void>;` 后直接关闭接口
**改后**: 新增 2 个接口方法声明 + 2 个实现方法

```typescript
// 接口声明（line 153-154）
resetStaleTasks(timeoutMs?: number): Promise<{ resetCount: number }>;
cleanupProcessedEvents(retentionDays?: number): Promise<{ deletedCount: number }>;

// 实现（在 deleteSavedView 实现之后）
async resetStaleTasks(timeoutMs?: number): Promise<{ resetCount: number }> {
  // POST /api/tasks/reset-stale
}
async cleanupProcessedEvents(retentionDays?: number): Promise<{ deletedCount: number }> {
  // POST /api/tasks/cleanup-events
}
```

**原因**: API 路由 `/api/tasks/reset-stale` 和 `/api/tasks/cleanup-events` 已存在但无 MCP 客户端方法，AI 代理无法调用。
**影响**: 代理现在可以通过 MCP 工具触发维护操作。

### 2. `src/mcp-server/tools.ts`

**改前** (line 4262): 103 个工具注册
**改后**: 105 个工具注册（+2）

新增工具:
- `reset_stale_tasks` — 重置卡在 picked/running 状态的任务，支持可选超时参数（默认 30 分钟）
- `cleanup_processed_events` — 清理过期的飞书事件去重记录，支持可选保留天数（默认 7 天）

**原因**: 两个 API 路由已有完整的后端实现（store → routes），但缺少 MCP 工具层，属于 gap pattern #6（API routes without MCP tools）。
**影响**: 代理可以执行系统维护任务，无需手动调用 HTTP API。

### 3. `test/mcp-server/tools.test.ts`

**改前** (line 1553): `expect(mockServer.registrations).toHaveLength(103)`
**改后**: `expect(mockServer.registrations).toHaveLength(105)`

新增内容:
- Mock client 实现: `resetStaleTasks` 和 `cleanupProcessedEvents` 方法
- 工具描述断言: `it("registers all 105 tools")`
- 8 个新测试: 注册检查、默认参数调用、自定义参数调用、错误处理

**原因**: 工具数量增加需要同步更新断言。
**影响**: 无副作用，仅保持测试与实现一致。

### 4. `FEATURES.md`

新增 Phase 48 追踪条目（7 项全部 [x]）。

## 结构性摘要

| 类型 | 内容 |
|------|------|
| 新增接口方法 | 2 (resetStaleTasks, cleanupProcessedEvents) |
| 新增客户端实现 | 2 |
| 新增 MCP 工具 | 2 (reset_stale_tasks, cleanup_processed_events) |
| 新增测试 | 8 |
| 工具总数 | 103 → 105 |

## 风险说明

- **低风险**: 两个 API 路由已在线上运行，MCP 工具仅是其客户端封装
- 无 store 层变更，无数据库 schema 变更
- 所有参数均为可选，有合理的默认值

## 验证步骤

```bash
cd /opt/harness-remote
npm run typecheck   # ✅ 通过
npm run build       # ✅ 通过
npm test            # ✅ 387 tests passed (11 files)
```
