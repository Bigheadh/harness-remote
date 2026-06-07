# 2026-06-07 Audit Management MCP Tools Research

## 研究方向

Gap pattern #7: API routes without MCP tools — 发现审计子系统有 2 个 API 路由 (`/api/audit/count`, `/api/audit/cleanup`) 但缺少 MCP 工具。

## 研究过程

1. 运行 gap discovery protocol（路由 vs 工具交叉对比）
2. 发现 `/api/audit/count` (GET) 和 `/api/audit/cleanup` (POST) 路由已存在
3. 确认客户端方法缺失（无 `getAuditCount` 和 `cleanupAuditLog`）
4. 确认 MCP 工具缺失（无 `audit_count` 和 `cleanup_audit_log`）
5. 参考 `cleanup_expired_api_keys` 工具的模式实现新工具

## 实现决策

- 采用 compressed implementation 模式（跳过 types/store/routes 层，直接 client → tools → tests）
- `audit_count` 工具无输入参数，返回审计日志总数
- `cleanup_audit_log` 工具接受可选 `retentionDays` 参数（默认 30 天），返回删除数量
- 遵循现有工具注册模式（try/catch + isError + JSON.stringify）

## 开源项目参考

搜索了以下高星项目获取灵感：
- **Plane** (50k+ ⭐): Jira/Linear 替代品，有 sprint、gantt、kanban
- **OpenProject** (15k+ ⭐): 项目管理软件，有 gantt、roadmap、workflows
- **Kanboard** (9k+ ⭐): 看板项目管理
- **TaskCafe** (5k+ ⭐): 开源项目管理工具

关键发现：这些项目都提供审计日志/活动日志的管理和查询功能，验证了审计 MCP 工具的价值。

## 下一步研究方向

- 考虑 cycle 批量操作（bulk add tasks to cycle）
- 研究 Gantt 图可视化功能
- 检查其他可能的 API routes without MCP tools gap
