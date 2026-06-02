# Changelog: Task History Search

**Date:** 2026-06-02
**Feature:** Task History Search (Phase 19 — v2 Enhancement)
**Files changed:** 5

## 概览

| 指标 | 值 |
|------|-----|
| 涉及文件数 | 5 |
| 新增行数 | ~120 |
| 删除行数 | ~5 |

## 逐文件改动

### 1. `src/server/tasks/store.ts`

**改动 1: 新增 `SearchOptions` 接口 (L6-11)**
- 改前: 无
- 改后: 定义 `SearchOptions` 接口，包含 `q`, `status`, `from`, `to`, `limit` 字段
- 原因: 为 `searchTasks` 方法提供类型安全的搜索参数
- 影响: `TaskStore` 接口新增 `searchTasks` 方法

**改动 2: `TaskStore` 接口新增 `searchTasks` 方法 (L14)**
- 改前: 无 `searchTasks` 方法
- 改后: `searchTasks(options: SearchOptions): Promise<Task[]>`
- 原因: 允许 API 路由和 MCP 工具调用搜索功能

**改动 3: `searchTasks` 实现 (L192-229)**
- 改前: 无
- 改后: 使用动态 SQL 拼接实现搜索。支持 `command_text` 和 `result_summary` 的 LIKE 模糊搜索、状态过滤、日期范围过滤、结果数量限制。默认按 `created_at DESC` 排序，limit 上限 100。
- 原因: 支持任务历史检索，是 v2 核心能力
- 风险: LIKE 查询在大数据量下可能较慢（无全文索引），v1 可接受

### 2. `src/server/tasks/routes.ts`

**改动 1: 新增 `GET /api/tasks/search` 路由 (L53-84)**
- 改前: 无
- 改后: 新增搜索端点，支持 `q`, `status`, `from`, `to`, `limit` 查询参数
- 原因: HTTP API 层暴露搜索能力，供 MCP client 调用
- 校验: 对 `status`、`from`、`to` 进行参数校验，非法值返回 400
- 注意: 静态路由 `/api/tasks/search` 注册在参数路由 `/api/tasks/:id` 之前，Fastify 优先匹配静态路由

### 3. `src/mcp-server/client.ts`

**改动 1: `TaskApiClient` 接口新增 `searchTasks` 方法 (L5-11)**
- 改前: 无
- 改后: 方法签名与 `TaskStore.searchTasks` 一致
- 原因: MCP client 需要调用服务端搜索 API

**改动 2: `searchTasks` 实现 (L46-74)**
- 改前: 无
- 改后: 使用 `fetch` 调用 `GET /api/tasks/search`，将 `SearchOptions` 序列化为 URL 查询参数
- 原因: MCP server 需要通过 HTTP 访问服务端搜索能力

### 4. `src/mcp-server/tools.ts`

**改动 1: 新增 `search_tasks` MCP 工具 (L56-115)**
- 改前: 无
- 改后: 注册 `search_tasks` 工具，描述为 "Search task history by text, status, and date range"
- 输入 schema: `q` (可选文本), `status` (可选状态), `from` (可选 ISO 日期), `to` (可选 ISO 日期), `limit` (可选 1-100)
- 输出: `{ tasks: Task[], count: number }`
- 原因: Codex CLI 可通过 MCP 工具搜索任务历史

### 5. `test/mcp-server/tools.test.ts`

**改动 1: Mock 新增 `searchTasks` 方法 (L101-125)**
- 改前: 无
- 改后: Mock client 新增 `searchTasks` 实现，返回模拟搜索结果
- 原因: 支持 search_tasks 工具的单元测试

**改动 2: 工具注册数量从 5 更新为 6 (L155)**
- 改前: `toHaveLength(5)`
- 改后: `toHaveLength(6)`
- 原因: 新增了 search_tasks 工具

**改动 3: 新增 search_tasks 注册测试 (L211-215)**
- 改前: 无
- 改后: 验证 `search_tasks` 工具的 description 包含 "Search task history"
- 原因: 确保工具正确注册

**改动 4: 新增 search_tasks handler 测试 (L396-442)**
- 3 个测试用例: 文本查询、全部参数传递、错误处理
- 原因: 覆盖 search_tasks 工具的核心路径

### 6. `test/server/tasks.store.test.ts`

**改动 1: 新增 `searchTasks` 测试套件 (L317-393)**
- 8 个测试用例: 空结果、文本搜索(commandText)、文本搜索(resultSummary)、状态过滤、日期范围、多条件组合、limit 限制、排序验证
- 原因: 全面覆盖搜索存储层的正确性

### 7. `FEATURES.md`

- 新增 Phase 19 "v2 Feature Enhancements"，标记前两项为完成

## 结构性摘要

- **新增**: `SearchOptions` 接口
- **新增**: `TaskStore.searchTasks` 方法（含接口和实现）
- **新增**: `GET /api/tasks/search` HTTP 端点
- **新增**: `TaskApiClient.searchTasks` 方法（含接口和实现）
- **新增**: `search_tasks` MCP 工具
- **新增**: 11 个测试用例（3 个 MCP 工具 + 8 个 store）

## 风险说明

- **低风险**: LIKE 模糊查询在大数据量下可能较慢，无全文索引。v1 任务量级可接受。
- **低风险**: 静态路由 `/api/tasks/search` 必须在 `/api/tasks/:id` 之前注册，否则会被参数路由拦截。已确认 Fastify 路由注册顺序正确。

## 验证步骤

```bash
npm run typecheck  # 通过
npm run build      # 通过
npm run test       # 127/127 通过
```
