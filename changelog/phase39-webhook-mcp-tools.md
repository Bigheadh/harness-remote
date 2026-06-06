# Phase 39: Webhook Management MCP Tools

## 概览

| 日期 | 任务 | 涉及文件数 | 新增行数 | 修改行数 |
|------|------|-----------|---------|---------|
| 2026-06-06 | Webhook MCP Tools | 3 | ~230 | ~10 |

## 动机

Webhooks 已有完整的 store、API 路由和 dashboard 管理 UI，但 MCP 层完全缺失——AI 代理无法通过 MCP 协议创建、查询、更新或删除 webhook 订阅。这限制了 AI 代理在自动化工作流中的能力。

## 改动明细

### 1. `src/mcp-server/client.ts`

**新增 import**
```typescript
// 改前
import type { SlaPolicy, SlaBreachLog, SlaSummary } from "../shared/types.js";

// 改后
import type { SlaPolicy, SlaBreachLog, SlaSummary } from "../shared/types.js";
import type { WebhookSubscription, WebhookDelivery } from "../shared/types.js";
```
**原因**: 引入 Webhook 类型供接口和实现使用。

**新增 TaskApiClient 接口方法** (6 个方法)
```typescript
// 新增
listWebhooks(): Promise<WebhookSubscription[]>;
getWebhook(webhookId: string): Promise<WebhookSubscription>;
createWebhook(data: { url: string; events: string[]; enabled?: boolean; description?: string }): Promise<WebhookSubscription>;
updateWebhook(webhookId: string, updates: { url?: string; events?: string[]; enabled?: boolean; description?: string }): Promise<WebhookSubscription>;
deleteWebhook(webhookId: string): Promise<void>;
listWebhookDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]>;
```
**原因**: 定义 webhook 管理的 MCP 客户端接口。

**新增 createTaskApiClient 实现** (6 个方法，约 85 行)
- `listWebhooks()` — GET /api/webhooks
- `getWebhook(id)` — GET /api/webhooks/:id
- `createWebhook(data)` — POST /api/webhooks
- `updateWebhook(id, updates)` — PATCH /api/webhooks/:id
- `deleteWebhook(id)` — DELETE /api/webhooks/:id
- `listWebhookDeliveries(id, limit)` — GET /api/webhooks/:id/deliveries

**原因**: 实现 HTTP 客户端方法，调用已有的 webhook API 路由。

### 2. `src/mcp-server/tools.ts`

**新增 6 个 MCP 工具** (~220 行)

| 工具名 | 描述 | 输入参数 |
|--------|------|----------|
| `list_webhooks` | 列出所有 webhook 订阅 | 无 |
| `get_webhook` | 获取单个 webhook 详情 | webhookId |
| `create_webhook` | 创建新的 webhook 订阅 | url, events, enabled?, description? |
| `update_webhook` | 更新 webhook 订阅 | webhookId, url?, events?, enabled?, description? |
| `delete_webhook` | 删除 webhook 订阅 | webhookId |
| `list_webhook_deliveries` | 查看 webhook 投递历史 | webhookId, limit? |

**原因**: 使 AI 代理能够通过 MCP 协议完整管理 webhook，包括 CRUD 操作和投递日志查询。

### 3. `test/mcp-server/tools.test.ts`

**新增 mock 方法** (6 个方法)
- `listWebhooks`, `getWebhook`, `createWebhook`, `updateWebhook`, `deleteWebhook`, `listWebhookDeliveries`

**更新工具计数断言** (69 → 75)

**新增 13 个测试用例**
- 工具注册验证 (6 个)
- 功能调用验证 (6 个)  
- 错误处理验证 (1 个)

**原因**: 确保所有 webhook MCP 工具正确注册和调用。

## 风险说明

- **低风险**: 所有改动在 MCP 层（客户端 + 工具），不影响 store 或 API 路由
- **向后兼容**: 新增接口方法为 TaskApiClient 的扩展，不影响现有调用方
- **无数据库改动**: 使用已有的 webhook_subscriptions 和 webhook_deliveries 表

## 验证步骤

```bash
cd /opt/harness-remote
npm run typecheck  # ✅ 通过
npm run build      # ✅ 通过
npm test           # ✅ 283 测试通过 (原 270)
```
