# 研究报告: 维护 MCP 工具 — Phase 48

## 研究方向

Gap pattern #6: API routes without MCP tools. 检查已有 API 路由中哪些没有对应的 MCP 工具注册。

## 发现

通过对比 `src/server/*/routes.ts` 中的所有 API 路由与 `src/mcp-server/tools.ts` 中的工具注册，发现 2 个 API 路由缺少 MCP 工具:

| API 路由 | Store 方法 | MCP 工具 | 状态 |
|----------|-----------|---------|------|
| POST /api/tasks/reset-stale | resetStaleTasks() | ❌ → ✅ reset_stale_tasks | 已补全 |
| POST /api/tasks/cleanup-events | cleanupProcessedEvents() | ❌ → ✅ cleanup_processed_events | 已补全 |

## 参考项目

### Plane (50k⭐) — 任务管理系统
- **维护操作**: Plane 有定时任务清理过期数据和重置卡住的任务状态
- **可借鉴**: 将维护操作暴露为 MCP 工具，让 AI 代理可以自主执行系统维护

### n8n (50k⭐) — 工作流自动化
- **执行器健康检查**: n8n 有自动重试和超时检测机制
- **可借鉴**: reset_stale_tasks 本质上是手动触发的超时检测

## 实现决策

### 为什么选择这两个工具
1. **零后端变更**: API 路由和 store 方法已完整实现，只需添加 MCP 客户端和工具层
2. **运维价值高**: 这两个是系统维护的核心操作，之前只能通过 HTTP API 或 dashboard 手动触发
3. **符合 gap pattern #6**: 标准的"路由已有但工具缺失"模式

### 技术方案
- 压缩实现模式（5 步而非 8 步）：跳过 types/store/routes，直接 client → tools → tests
- 参数全部可选，有合理默认值（30min / 7天）
- 工具描述明确说明用途和默认值

## 当前状态

- MCP 工具总数: 105
- API 路由总数: 120
- 路由/工具覆盖差距: 仍有 15 个路由没有对应工具（主要是 GET 健康检查、dashboard 页面、SSE 流等不需要 MCP 工具的路由）

## 下一步研究方向

1. **Dashboard 管理 UI 增强** — 增加更多可视化图表
2. **任务批量操作增强** — 参考 Linear 的批量编辑能力
3. **Webhook 重试策略优化** — 参考 n8n 的指数退避实现
4. **Token 压缩** — 参考 headroom 项目，对大 MCP 响应体进行摘要
