# Research: Unused Exports Gap Analysis

**Date**: 2026-06-07
**Phase**: 51
**Gap Pattern**: #1 — Unused exports signal missing integration

## 搜索方法

通过 `grep -rn "^export function|^export const" src/server/ --include="*.ts"` 扫描所有导出函数/常量，然后用 `grep -rn` 检查每个导出是否在其他文件中被引用。

## 发现的未使用导出

| 文件 | 导出名 | 是否真正未使用 | 处理方式 |
|------|--------|----------------|----------|
| metrics/collector.ts | recordFeishuReply | ✅ 未使用 | Phase 51: 连接到 feishu client |
| metrics/collector.ts | recordSlaEvent | ✅ 未使用 | Phase 51: 连接到 SLA check 路由 |
| metrics/collector.ts | recordWebhookDelivery | ✅ 未使用 | Phase 51: 连接到 webhook dispatcher |
| metrics/collector.ts | recordApiKeyOp | ✅ 未使用 | Phase 51: 连接到 API key 路由 |
| webhooks/dispatcher.ts | signPayload | ❌ 在同文件内使用 | 无需处理 |
| webhooks/dispatcher.ts | calculateBackoffDelay | ❌ 在同文件内使用 | 无需处理 |
| auth/middleware.ts | extractBearerToken | ❌ 在同文件内使用 | 无需处理 |
| auth/roles.ts | getRolePermissions | ❌ 在同文件内使用 | 无需处理 |
| auth/roles.ts | ALL_PERMISSIONS | ❌ 在同文件内使用 | 无需处理 |
| feishu/events.ts | parseFeishuEvent | ❌ 在同文件内使用 | 无需处理 |
| feishu/events.ts | createTaskFromFeishuEvent | ❌ 在同文件内使用 | 无需处理 |

## 分析

metrics collector 中的 4 个录制函数是在早期 Phase（Phase 22: Observability & Analytics）中创建的，但当时只连接了核心指标（HTTP 请求、任务创建/完成、事件处理、速率限制）。次要指标（飞书回复、SLA 事件、webhook 投递、API key 操作）被定义但从未接入实际调用点。

这是一个典型的 "功能已构建但未接线" 的 gap pattern。修复方式简单直接：在每个操作的成功/失败路径中添加录制调用。

## 实现决策

- **Feishu client**: 使用 try/catch 包装，成功记录 true，异常记录 false 后重新抛出。保持原有错误传播行为。
- **Webhook dispatcher**: 在成功和非重试失败路径中分别记录。重试路径不记录（因为不是最终结果）。
- **SLA check**: 根据返回的 warnings/breaches 数量循环调用，每个事件单独记录。
- **API key routes**: 在每个操作成功后记录，不记录失败（失败时操作未执行）。

## 下一步研究方向

- 检查是否有更多未使用的导出在其他模块中
- 研究 Prometheus 告警规则的最佳实践
- 考虑添加 Grafana dashboard 模板
