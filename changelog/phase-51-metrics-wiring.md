# Phase 51: Wire Up Unused Prometheus Metrics Recorders

## 概览

| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 连接 4 个未使用的 Prometheus 指标记录函数到实际调用点 |
| 涉及文件数 | 4 |
| 新增行数 | ~30 |
| 删除行数 | 0 |

## 文件改动

### 1. src/server/feishu/client.ts

**改动**: 为 `replyToMessage`、`sendCardMessage`、`sendDirectCardMessage` 三个方法添加 try/catch 包装，成功时调用 `recordFeishuReply(true)`，失败时调用 `recordFeishuReply(false)`。

**改前**:
```typescript
async replyToMessage(input: FeishuReplyInput): Promise<void> {
  const token = await getTenantAccessToken(config);
  // ... API call ...
  if (data.code !== 0) {
    throw new Error(`Failed to reply to Feishu message: ${data.msg}`);
  }
}
```

**改后**:
```typescript
async replyToMessage(input: FeishuReplyInput): Promise<void> {
  try {
    const token = await getTenantAccessToken(config);
    // ... API call ...
    if (data.code !== 0) {
      throw new Error(`Failed to reply to Feishu message: ${data.msg}`);
    }
    recordFeishuReply(true);
  } catch (err) {
    recordFeishuReply(false);
    throw err;
  }
}
```

**原因**: `recordFeishuReply` 已在 metrics collector 中定义但从未被调用，导致 `/metrics` 端点的 `harness_remote_feishu_replies_total` 指标始终为空。

**影响**: Prometheus 现在可以监控飞书回复的成功/失败率。

### 2. src/server/webhooks/dispatcher.ts

**改动**: 在 `deliverToWebhook` 函数的成功和失败路径中分别调用 `recordWebhookDelivery(true)` 和 `recordWebhookDelivery(false)`。

**改前**:
```typescript
log.info({ webhookId: sub.id, event, statusCode: response.status, durationMs, attempt },
  "Webhook delivered successfully");
return;
```

**改后**:
```typescript
log.info({ webhookId: sub.id, event, statusCode: response.status, durationMs, attempt },
  "Webhook delivered successfully");
recordWebhookDelivery(true);
return;
```

**原因**: `recordWebhookDelivery` 已定义但未连接到实际的 webhook 投递流程。

**影响**: Prometheus 现在可以监控 webhook 投递的成功/失败率。

### 3. src/server/tasks/routes.ts

**改动**: 在 `POST /api/sla/check` 路由中，根据 `checkAndRecordSlaBreaches()` 的返回结果调用 `recordSlaEvent("warning")` 和 `recordSlaEvent("breach")`。

**改前**:
```typescript
const result = await store.checkAndRecordSlaBreaches();
log.info({ warnings: result.warnings, breaches: result.breaches }, "SLA breach check completed");
```

**改后**:
```typescript
const result = await store.checkAndRecordSlaBreaches();
log.info({ warnings: result.warnings, breaches: result.breaches }, "SLA breach check completed");
if (result.warnings > 0) {
  for (let i = 0; i < result.warnings; i++) {
    recordSlaEvent("warning");
  }
}
if (result.breaches > 0) {
  for (let i = 0; i < result.breaches; i++) {
    recordSlaEvent("breach");
  }
}
```

**原因**: `recordSlaEvent` 已定义但未在 SLA 检查流程中使用。

**影响**: Prometheus 现在可以监控 SLA 警告和违规事件的频率。

### 4. src/server/auth/apikeys/routes.ts

**改动**: 在 API key 的 create、rotate、revoke、enable、disable、cleanup 操作成功后分别调用 `recordApiKeyOp("create")` 等。

**改前**: 各操作只有 log.info 记录。

**改后**:
```typescript
log.info({ apiKeyId: apiKey.id, ... }, "API key created");
recordApiKeyOp("create");
```

**原因**: `recordApiKeyOp` 已定义但未在 API key 路由中使用。

**影响**: Prometheus 现在可以监控 API key 操作的频率分布。

## 风险说明

- **低风险**: 所有改动仅为添加指标记录调用，不改变任何业务逻辑
- try/catch 包装在 feishu client 中保持了原有的错误抛出行为
- 指标记录函数是同步的内存操作，不会影响性能

## 验证步骤

- [x] `npm run typecheck` — 通过
- [x] `npm run build` — 通过
- [x] `npm test` — 396/396 通过
- [x] 确认 `recordFeishuReply`、`recordWebhookDelivery`、`recordSlaEvent`、`recordApiKeyOp` 均被调用
