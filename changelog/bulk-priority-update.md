# Phase 61: Bulk Priority Update MCP Tool

## 概览

| 日期 | 任务 | 涉及文件数 | 新增行数 |
|------|------|-----------|---------|
| 2026-06-07 | 批量更新任务优先级 MCP 工具 | 5 | ~95 |

## 改动详情

### 1. `src/server/tasks/store.ts`

**改动 1: Store 接口添加 bulkUpdatePriority 方法签名**
- 位置: TaskStore 接口, `bulkRemoveTags` 之后
- 改前: 无
- 改后: `bulkUpdatePriority(ids: string[], priority: TaskPriority): Promise<{ updated: number; errors: string[] }>;`
- 原因: 支持批量更新任务优先级的 store 层方法
- 影响: TaskStore 接口新增方法

**改动 2: bulkUpdatePriority 实现**
- 位置: TaskStore 实现, `bulkRemoveTags` 之后, `createTemplate` 之前
- 改前: 无
- 改后: 新增方法, 遍历 id 列表, 逐个验证任务存在后更新 priority 字段
- 原因: 实现批量优先级更新逻辑, 与现有 bulk 操作模式一致
- 影响: 数据库层新增更新操作

### 2. `src/server/tasks/routes.ts`

**改动: POST /api/tasks/bulk/priority 路由**
- 位置: bulk/unarchive 路由之后, /api/tasks/ready 之前
- 改前: 无
- 改后: 新增路由, 验证 ids 数组和 priority 值, 调用 store.bulkUpdatePriority, 记录审计日志, 广播 SSE 事件
- 原因: 提供 HTTP API 端点支持批量优先级更新
- 影响: API 新增端点, 需要在参数化路由前注册

### 3. `src/mcp-server/client.ts`

**改动 1: TaskApiClient 接口添加 bulkUpdatePriority 方法签名**
- 位置: TaskApiClient 接口, `bulkRemoveTags` 之后
- 改前: 无
- 改后: `bulkUpdatePriority(ids: string[], priority: string): Promise<{ updated: number; errors: string[] }>;`
- 原因: MCP 客户端接口需要支持批量优先级更新

**改动 2: bulkUpdatePriority 实现**
- 位置: TaskApiClient 实现, `bulkRemoveTags` 之后
- 改前: 无
- 改后: HTTP fetch 调用 POST /api/tasks/bulk/priority
- 原因: 实现 MCP 客户端的批量优先级更新

### 4. `src/mcp-server/tools.ts`

**改动: bulk_update_priority MCP 工具注册**
- 位置: bulk_unarchive_tasks 工具之后, escalate_overdue_priorities 之前
- 改前: 无
- 改后: 新增工具注册, 接受 ids 数组和 priority 枚举, 调用 client.bulkUpdatePriority
- 原因: 让 AI 代理可以批量更新任务优先级
- 影响: MCP 工具数从 121 增加到 122

### 5. `test/mcp-server/tools.test.ts`

**改动 1: Mock client 添加 bulkUpdatePriority**
- 位置: createMockClient 函数, bulkRemoveTags 之后
- 改前: 无
- 改后: mock 实现, 记录调用并返回成功结果
- 原因: 测试需要 mock 客户端支持新方法

**改动 2: 工具计数断言更新**
- 位置: tool registration describe 块
- 改前: `toHaveLength(121)`, `"registers all 121 tools"`
- 改后: `toHaveLength(122)`, `"registers all 122 tools"`
- 原因: 新增 1 个 MCP 工具

**改动 3: 新增 3 个测试用例**
- 位置: 新增 `describe("bulk_update_priority")` 块
- 改前: 无
- 改后: 3 个测试: 注册验证, 批量更新验证, 错误处理验证
- 原因: 覆盖新工具的核心功能

## 风险说明

- **低风险**: 新增独立功能, 不影响现有代码
- **路由顺序**: 必须在 `/api/tasks/:id` 参数化路由前注册, 已验证
- **数据库**: 无 schema 变更, 仅使用已有的 priority 字段

## 验证步骤

- [x] `npm run typecheck` — 通过
- [x] `npm run build` — 通过
- [x] `npm test` — 458/458 测试通过 (新增 3 个)
- [x] 工具计数: 122 个注册工具
- [x] FEATURES.md 已更新
