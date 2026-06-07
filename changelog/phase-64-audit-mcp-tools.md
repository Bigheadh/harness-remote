# Phase 64: Audit Management MCP Tools

## 概览

| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 添加审计日志管理和查询 MCP 工具 |
| 涉及文件 | 3 个 |
| 新增行数 | ~80 行 |
| 删除行数 | 0 行 |

## 逐文件改动

### 1. `src/mcp-server/client.ts`

**改动 1: TaskApiClient 接口新增方法声明**

- 位置: 第 189-191 行 (接口末尾)
- 改前: 接口以 `listCycleTasks()` 结尾
- 改后: 新增 `getAuditCount()` 和 `cleanupAuditLog()` 方法声明
- 原因: API 路由 `/api/audit/count` 和 `/api/audit/cleanup` 已存在但无客户端方法，AI 代理无法通过 MCP 协议访问
- 影响: TaskApiClient 接口扩展，所有实现此接口的类需添加对应方法

**改动 2: 客户端实现新增两个方法**

- 位置: 第 2249-2272 行 (客户端对象末尾)
- 改前: `listCycleTasks` 是最后一个方法
- 改后: 新增 `getAuditCount()` (GET /api/audit/count) 和 `cleanupAuditLog()` (POST /api/audit/cleanup) 实现
- 原因: 为 MCP 工具提供底层 HTTP 调用能力
- 影响: 无破坏性变更，新增方法

### 2. `src/mcp-server/tools.ts`

**改动: 新增两个 MCP 工具注册**

- 位置: 第 5312-5378 行 (函数末尾)
- 改前: `list_cycle_tasks` 是最后一个注册的工具
- 改后: 新增 `audit_count` 和 `cleanup_audit_log` 工具
- 原因: 填补 API 路由与 MCP 工具之间的鸿沟，让 AI 代理能查询审计日志数量和执行清理
- 影响: MCP 工具总数从 132 增加到 134

### 3. `test/mcp-server/tools.test.ts`

**改动 1: Mock 客户端新增两个方法**

- 位置: 第 1786-1797 行
- 改前: `listCycleTasks` mock 是最后一个
- 改后: 新增 `getAuditCount` 和 `cleanupAuditLog` mock 实现
- 原因: 测试需要完整的 mock 客户端来验证工具注册

**改动 2: 工具计数断言更新**

- 位置: 第 1853-1854 行
- 改前: `toHaveLength(132)`
- 改后: `toHaveLength(134)`
- 原因: 新增 2 个工具，需更新断言

## 结构性摘要

- **新增**: 2 个 MCP 工具 (`audit_count`, `cleanup_audit_log`)
- **新增**: 2 个客户端方法 (`getAuditCount`, `cleanupAuditLog`)
- **新增**: 2 个接口方法声明
- **新增**: 2 个 mock 方法
- **无删除/重构**

## 风险说明

- **低风险**: 仅新增方法，不修改现有逻辑
- **无破坏性变更**: 现有工具和客户端方法不受影响
- **类型安全**: TypeScript 编译通过，所有新增方法都有完整类型签名

## 验证步骤

1. ✅ `npm run typecheck` — 编译通过
2. ✅ `npm run build` — 构建成功
3. ✅ `npm test` — 489 个测试全部通过 (包括工具计数断言)
4. ✅ 工具注册数: 132 → 134
