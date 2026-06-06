# 研究报告: Webhook MCP 工具补齐

## 日期
2026-06-06

## 研究方向
Webhook 管理 MCP 层缺口分析

## 发现
harness-remote 的 Webhook 子系统已完成 38 个阶段的开发，包括：
- **Store 层** (`src/server/webhooks/store.ts`): 完整的 CRUD + 投递日志 + 重试队列
- **API 路由** (`src/server/webhooks/routes.ts`): 6 个 HTTP 端点 (list, get, create, update, delete, deliveries, rotate-secret)
- **Dashboard UI** (`src/server/dashboard/templates/dashboard.ts`): Settings tab 中的 webhook 管理
- **投递系统** (`src/server/webhooks/dispatcher.ts`): 事件触发 → HTTP POST → 重试

**但 MCP 层完全缺失** — AI 代理无法通过 MCP 协议管理 webhooks。

## 实现方案
添加 6 个 MCP 工具补齐缺口：
1. `list_webhooks` — 列出所有订阅
2. `get_webhook` — 获取单个详情
3. `create_webhook` — 创建新订阅
4. `update_webhook` — 更新配置
5. `delete_webhook` — 删除订阅
6. `list_webhook_deliveries` — 查看投递历史

## 参考项目
- **n8n** (45k+ stars): Webhook 节点支持测试投递、查看历史、签名验证
- **Plane** (30k+ stars): Webhook 管理有完整的 CRUD + 投递日志
- **Huly** (15k+ stars): Webhook 配置包含事件过滤、重试策略

## 结论
Webhook 是事件驱动架构的关键组件。补齐 MCP 工具后，AI 代理可以：
- 自动创建 webhook 订阅来接收任务事件通知
- 查询投递日志来调试集成问题
- 动态管理 webhook 配置（启用/禁用、更改 URL）
