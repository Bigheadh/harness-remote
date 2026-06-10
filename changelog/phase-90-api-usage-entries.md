# Phase 90: API Usage Entries MCP Tool

## 概览

| 项目 | 详情 |
|------|------|
| 日期 | 2026-06-10 |
| 任务 | 添加 API Usage Entries MCP Tool |
| 涉及文件数 | 4 |
| 新增测试 | 4 |
| 测试总数 | 564 → 572 |
| MCP 工具数 | 157 → 158 |

## 逐文件改动

### 1. src/mcp-server/client.ts

**改动 1: 接口声明添加新方法**
- 位置: ~line 134
- 改前: `getApiUsageStats(from?: string, to?: string): Promise<Record<string, unknown>>;`
- 改后: 在 `getApiUsageStats` 后添加 `getApiUsageEntries(callerId: string, limit?: number): Promise<Record<string, unknown>>;`
- 原因: `TaskApiClient` 接口需要声明新方法以保持类型安全
- 影响: 所有使用 `TaskApiClient` 的代码（MCP tools、tests）需要实现此方法

**改动 2: 客户端实现**
- 位置: ~line 1756 (getApiUsageStats 之后)
- 改前: 无
- 改后: 新增 `getApiUsageEntries` 方法，调用 `GET /api/usage/entries/:callerId` 并传递可选 limit 参数
- 原因: MCP tools 层需要 HTTP 客户端来调用已有的 API 路由
- 影响: 无（新增方法，不影响现有功能）

### 2. src/mcp-server/tools.ts

**改动 3: MCP 工具注册**
- 位置: ~line 3981 (get_api_usage 工具之后)
- 改前: 无
- 改后: 新增 `get_api_usage_entries` 工具注册，接受 `callerId` (必填) 和 `limit` (可选) 参数
- 原因: `/api/usage/entries/:callerId` 路由已有但缺少 MCP 工具覆盖，AI 代理无法程序化查询特定调用者的原始 API 使用记录
- 影响: AI 代理现在可以通过 MCP 协议查询特定用户/设备/Token/IP 的 API 调用历史

### 3. test/mcp-server/tools.test.ts

**改动 4: Mock 客户端添加新方法**
- 位置: ~line 1265 (getApiUsageStats mock 之后)
- 改前: 无
- 改后: 新增 `getApiUsageEntries` mock 实现，追踪调用并返回示例数据
- 原因: Mock 客户端需要实现 `TaskApiClient` 接口的所有方法
- 影响: 测试可以验证新工具的调用行为

**改动 5: 工具计数断言更新**
- 位置: ~line 2141
- 改前: `it("registers all 157 tools", () => { expect(mockServer.registrations).toHaveLength(157);`
- 改后: `it("registers all 158 tools", () => { expect(mockServer.registrations).toHaveLength(158);`
- 原因: 新增一个 MCP 工具，计数需要同步更新
- 影响: 测试通过验证所有工具都已注册

**改动 6: 新增 4 个测试用例**
- 位置: ~line 2764 (get_api_usage 测试之后)
- 改前: 无
- 改后:
  1. `registers get_api_usage_entries with correct description` — 验证工具注册和描述
  2. `gets API usage entries for a caller` — 验证调用正确的方法和返回数据
  3. `passes limit parameter to get_api_usage_entries` — 验证 limit 参数传递
  4. `returns error when get_api_usage_entries fails` — 验证错误处理
- 原因: 确保新工具在各种场景下正确工作
- 影响: 测试覆盖从 564 增加到 572

### 4. FEATURES.md

**改动 7: 新增 Phase 90**
- 位置: 文件末尾
- 改前: Phase 89 为最后一个阶段
- 改后: 新增 Phase 90: API Usage Entries MCP Tool，包含 6 个已完成的子项
- 原因: 记录项目演进进度
- 影响: 项目进度追踪更新

## 结构性摘要

- **新增**: 1 个 MCP 工具 (`get_api_usage_entries`)，1 个客户端方法，4 个测试
- **删除**: 无
- **重构**: 无

## 风险说明

- **风险等级**: 低
- **风险**: 这是一个纯增量变更，不修改任何现有代码逻辑
- **缓解措施**: 新工具只是包装了已有的 API 路由，不改变路由行为

## 验证步骤

- [x] `npm run typecheck` 通过
- [x] `npm run build` 通过
- [x] `npm test` 全部 572 个测试通过
- [x] 服务正常启动，health 端点响应 401 (auth required)
