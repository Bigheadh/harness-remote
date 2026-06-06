# Phase 46: API Key Management MCP Tools

## 概览

| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 为 API Key 管理添加 MCP 工具覆盖 |
| 涉及文件 | 4 |
| 新增工具 | 8 个 MCP tools |
| 新增测试 | 22 个测试用例 |

## 问题背景

API Key 管理模块在 Phase 21 实现了完整的 REST API 路由（CRUD + rotate/revoke/enable/disable/cleanup），但始终没有对应的 MCP 工具。这意味着 AI Agent（如 Codex CLI）无法通过 MCP 协议管理 API Key——只能通过 HTTP API 或 Dashboard Settings 手动操作。

## 逐文件改动

### 1. `src/mcp-server/client.ts`

**改动 1: 接口扩展（第 137 行后）**

```typescript
// 改前: 用户管理方法后直接闭合接口
  regenerateUserToken(userId: string): Promise<User>;
}

// 改后: 新增 8 个 API Key 方法签名
  regenerateUserToken(userId: string): Promise<User>;
  // API key management methods
  listApiKeys(userId?: string): Promise<Array<Record<string, unknown>>>;
  getApiKey(keyId: string): Promise<Record<string, unknown>>;
  createApiKey(name: string, userId: string, role?: string): Promise<Record<string, unknown>>;
  rotateApiKey(keyId: string, gracePeriodMs?: number): Promise<Record<string, unknown>>;
  revokeApiKey(keyId: string): Promise<void>;
  enableApiKey(keyId: string): Promise<Record<string, unknown>>;
  disableApiKey(keyId: string): Promise<Record<string, unknown>>;
  cleanupExpiredApiKeys(): Promise<{ cleaned: number }>;
}
```

**改动 2: HTTP 客户端实现（第 1608 行后，return 对象闭合前）**

新增 8 个 async 方法，每个调用对应的 `/api/keys/*` REST 端点：
- `listApiKeys` → `GET /api/keys?userId=`
- `getApiKey` → `GET /api/keys/:id`
- `createApiKey` → `POST /api/keys`
- `rotateApiKey` → `POST /api/keys/:id/rotate`
- `revokeApiKey` → `POST /api/keys/:id/revoke`
- `enableApiKey` → `POST /api/keys/:id/enable`
- `disableApiKey` → `POST /api/keys/:id/disable`
- `cleanupExpiredApiKeys` → `POST /api/keys/cleanup-expired`

**修改原因**: 缺少 client 方法导致 MCP 工具无法调用后端 API。

### 2. `src/mcp-server/tools.ts`

**改动: 新增 8 个 MCP 工具注册（第 3808 行后，函数闭合前）**

| 工具名 | 描述 | 输入参数 |
|--------|------|----------|
| `list_api_keys` | 列出所有 API Key | `userId?` |
| `get_api_key` | 获取 API Key 详情 | `keyId` |
| `create_api_key` | 创建新 API Key | `name`, `userId`, `role?` |
| `rotate_api_key` | 轮换 API Key（带宽限期） | `keyId`, `gracePeriodMs?` |
| `revoke_api_key` | 永久撤销 API Key | `keyId` |
| `enable_api_key` | 启用被禁用的 API Key | `keyId` |
| `disable_api_key` | 禁用 API Key | `keyId` |
| `cleanup_expired_api_keys` | 清理过期的旧 Key | 无参数 |

**修改原因**: API 路由已有完整 CRUD，缺少 MCP 工具覆盖（Gap Pattern #6）。

### 3. `test/mcp-server/tools.test.ts`

**改动 1: Mock 客户端扩展**

新增 8 个 mock 方法（`listApiKeys`, `getApiKey`, `createApiKey`, `rotateApiKey`, `revokeApiKey`, `enableApiKey`, `disableApiKey`, `cleanupExpiredApiKeys`），每个返回合理的模拟数据。

**改动 2: 工具计数断言更新**

```typescript
// 改前
expect(mockServer.registrations).toHaveLength(90);
// 改后
expect(mockServer.registrations).toHaveLength(98);
```

**改动 3: 新增 22 个测试**

每个工具覆盖：注册验证、正常调用（验证 mock 方法名和参数）、错误场景（mock.failWith）。

### 4. `FEATURES.md`

新增 Phase 46 章节，标记所有 15 个子任务为 `[x]`。

## 结构性摘要

- **新增**: 8 个 MCP 工具、8 个客户端方法、22 个测试用例
- **修改**: 工具计数断言（90 → 98）
- **无删除**

## 风险说明

- **低风险**: 纯粹的 API-route-wrapping，不修改任何 store/route/类型逻辑
- API Key 的认证由已有的 `authenticate` + `authorize("users.write")` 中间件保护，无需额外鉴权
- 客户端使用 `Record<string, unknown>` 返回类型，避免了引入新的共享类型依赖

## 验证步骤

```bash
cd /opt/harness-remote
npm run typecheck    # ✅ 通过
npm run build        # ✅ 通过
npm test             # ✅ 362/362 通过
```
