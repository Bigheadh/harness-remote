# Changelog: Batch Task Operations

## 概览

| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-02 |
| 任务 | Phase 20: Batch task operations (bulk status update, bulk assign, bulk delete) |
| 涉及文件数 | 6 |
| 新增行数 | ~290 |
| 删除行数 | 0 |

## 逐文件改动

### 1. `src/server/tasks/store.ts`

**新增 TaskStore 接口方法（行 56-58）**

```typescript
// 改前：无
// 改后：
bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }>;
bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }>;
bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
```

- **原因**：需要批量操作的 store 层方法
- **影响**：所有实现 TaskStore 的代码（包括 mock）需实现这些方法

**新增 bulkUpdateStatus 实现（行 689-713）**

- **原因**：批量更新任务状态，逐条校验状态机转换
- **影响**：支持将多个任务同时更新到同一目标状态，跳过无效转换并报告错误

**新增 bulkAssign 实现（行 715-733）**

- **原因**：批量分配任务到设备
- **影响**：支持将多个任务同时分配到同一设备

**新增 bulkDelete 实现（行 735-758）**

- **原因**：批量删除任务及关联评论
- **影响**：使用 SQL IN 子句批量删除，分批处理（每批50个）避免 SQLite 变量限制

### 2. `src/server/tasks/routes.ts`

**新增 POST /api/tasks/bulk/status 路由（行 150-187）**

```typescript
// 改前：无
// 改后：POST /api/tasks/bulk/status
// 请求体：{ ids: string[], status: TaskStatus }
// 响应：{ ok: true, updated: number, errors: string[] }
```

- **原因**：HTTP API 层暴露批量状态更新能力
- **权限**：需要 `tasks.status` 权限
- **审计**：操作记录到审计日志

**新增 POST /api/tasks/bulk/assign 路由（行 189-226）**

```typescript
// 改前：无
// 改后：POST /api/tasks/bulk/assign
// 请求体：{ ids: string[], deviceId: string }
// 响应：{ ok: true, updated: number, errors: string[] }
```

- **原因**：HTTP API 层暴露批量分配能力
- **权限**：需要 `tasks.assign` 权限
- **审计**：操作记录到审计日志

**新增 POST /api/tasks/bulk/delete 路由（行 228-263）**

```typescript
// 改前：无
// 改后：POST /api/tasks/bulk/delete
// 请求体：{ ids: string[] }
// 响应：{ ok: true, deleted: number, errors: string[] }
```

- **原因**：HTTP API 层暴露批量删除能力
- **权限**：需要 `tasks.write` 权限
- **审计**：操作记录到审计日志
- **注意**：所有批量路由注册在 `/api/tasks/:id` 参数化路由之前，避免 Fastify 路由匹配冲突

### 3. `src/mcp-server/client.ts`

**新增 TaskApiClient 接口方法（行 34-36）**

```typescript
// 改前：无
// 改后：
bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }>;
bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }>;
bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
```

**新增三个 HTTP client 实现方法（行 390-453）**

- **原因**：MCP server 通过 HTTP client 调用服务端批量 API
- **影响**：每个方法封装了对应的 HTTP POST 请求和错误处理

### 4. `src/mcp-server/tools.ts`

**新增 bulk_update_status MCP 工具（行 733-768）**

```typescript
// 改前：无
// 改后：MCP tool "bulk_update_status"
// 输入：{ ids: string[], status: TaskStatus }
// 输出：{ updated, errors, message }
```

- **原因**：Codex CLI 通过 MCP 工具批量更新任务状态
- **约束**：ids 数组长度 1-100

**新增 bulk_assign_tasks MCP 工具（行 770-805）**

```typescript
// 改前：无
// 改后：MCP tool "bulk_assign_tasks"
// 输入：{ ids: string[], deviceId: string }
// 输出：{ updated, errors, message }
```

- **原因**：Codex CLI 通过 MCP 工具批量分配任务

**新增 bulk_delete_tasks MCP 工具（行 807-840）**

```typescript
// 改前：无
// 改后：MCP tool "bulk_delete_tasks"
// 输入：{ ids: string[] }
// 输出：{ deleted, errors, message }
```

- **原因**：Codex CLI 通过 MCP 工具批量删除任务
- **警告**：文档中标注操作不可逆

### 5. `test/mcp-server/tools.test.ts`

**新增 mock 方法（行 246-273）**

- `registerDevice` — 之前缺失的 mock 方法
- `queryAuditLog` — 之前缺失的 mock 方法
- `bulkUpdateStatus` — 新增批量操作 mock
- `bulkAssign` — 新增批量操作 mock
- `bulkDelete` — 新增批量操作 mock

- **原因**：mock client 需要实现 TaskApiClient 的所有方法

**更新工具数量断言（行 331）**

```typescript
// 改前：expect(mockServer.registrations).toHaveLength(14);
// 改后：expect(mockServer.registrations).toHaveLength(17);
```

- **原因**：新增 3 个 MCP 工具

### 6. `FEATURES.md`

**标记完成（行 132）**

```markdown
// 改前：- [ ] Batch task operations (bulk status update, bulk assign, bulk delete)
// 改后：- [x] Batch task operations (bulk status update, bulk assign, bulk delete)
```

## 结构性摘要

- **新增**：3 个 store 方法 + 3 个 API 路由 + 3 个 MCP client 方法 + 3 个 MCP 工具
- **新增**：批量操作支持审计日志记录
- **无删除**：所有新增功能，无破坏性变更

## 风险说明

- **低风险**：批量操作使用逐条处理模式（status/assign）或分批 SQL（delete），单个失败不影响其他任务
- **低风险**：批量路由注册在参数化路由之前，确保 Fastify 路由正确匹配
- **无破坏性**：仅新增功能，不修改现有 API 行为

## 验证步骤

1. ✅ `npm run typecheck` — 通过
2. ✅ `npm run build` — 通过
3. ✅ `npm run test` — 214 tests passed (8 test files)
4. ✅ 工具数量断言：14 → 17
5. ✅ FEATURES.md 已更新
