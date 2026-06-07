# Research: Task Activity Feed MCP Tool — Phase 54

**Date**: 2026-06-07
**Gap Pattern**: #6 — API routes without MCP tools
**Reference**: gap analysis of all API routes vs MCP tool registrations

## 搜索关键词

- `mcp server task management` — 474 结果，最高: atlas-mcp-server (474⭐)
- `linear+alternative+open+source` — 50k+ 结果，最高: plane (50428⭐)
- `model+context+protocol+server+stars:>200` — 最高: modelcontextprotocol/servers (86837⭐)
- `AI+agent+task+orchestration` — 最高: crewAI (52948⭐)

## 参考项目分析

### atlas-mcp-server (474⭐) — Neo4j 任务管理 MCP 服务器
- **核心特性**: 项目管理、任务管理、知识管理、统一搜索
- **可借鉴**: Knowledge 节点的搜索和引用功能，但架构差异太大
- **决策**: 不直接借鉴，但其"统一搜索"思路验证了跨实体查询的价值

### plane (50428⭐) — 开源 Jira/Linear 替代品
- **核心特性**: 看板视图、甘特图、循环视图、Saved Views、活动日志
- **可借鉴**: Activity Log 是 Plane 的核心功能之一，用户频繁查看任务历史
- **决策**: 验证了任务活动时间线的用户价值

### Linear (闭源参考)
- **核心特性**: Activity Timeline、评论、状态变更历史
- **可借鉴**: Linear 的 Activity Timeline 展示了完整的任务生命周期事件
- **决策**: 确认了活动时间线是任务管理工具的标配功能

## Gap 发现过程

通过交叉比对 API 路由和 MCP 工具注册：

1. **API 路由**: `GET /api/tasks/:id/activity` 已存在（Phase ~30 实现），返回合并的活动时间线
2. **MCP 工具**: 无对应工具 — AI 代理无法通过 MCP 协议查询任务活动历史
3. **MCP 客户端**: 无对应方法 — 缺少 HTTP 客户端调用

这是一个典型的 gap pattern #6（API routes without MCP tools）。Store 层、路由层都已完整实现，只需添加客户端层和工具层。

## 实现决策

### 为什么选择这个功能
1. **高用户价值**: AI 代理在处理任务时需要了解任务的完整历史（谁创建的、状态变更过几次、有哪些评论），才能做出更好的决策
2. **实现成本极低**: Store 和路由已完整实现，只需添加 client 方法 + tool 注册 + 测试
3. **参考验证**: Linear、Plane 等主流工具都将 Activity Timeline 作为核心功能
4. **低风险**: 纯新增，不修改任何现有代码路径

### 技术方案
- **Client**: 新增 `getActivityFeed(taskId, limit?)` 方法，调用 `/api/tasks/:id/activity`
- **Tool**: `get_task_activity` — inputSchema 包含 `taskId`（必填）和 `limit`（可选，默认 50，最大 200）
- **响应格式**: `{ items: ActivityFeedItem[], count: number }`
- **错误处理**: 捕获异常返回 `{ error: message }` + `isError: true`

## 下一步研究方向

1. **Dashboard task activity panel** — 在 Dashboard 的任务详情面板中展示活动时间线
2. **Activity feed filtering** — 按事件类型、时间范围、操作者过滤活动条目
3. **Webhook for activity events** — 当活动条目产生时触发 webhook 通知
