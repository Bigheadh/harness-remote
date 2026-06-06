# 研究报告: 看板视图 (Kanban Board) — Phase 40

## 搜索关键词
- `MCP server task management` — 474 结果，最高 stars: atlas-mcp-server (474⭐)
- `MCP server tools AI agent` — 15k+ 结果，最高: headroom (15k⭐)
- `feishu lark bot open source` — 7.3k 结果，最高: refly (7.3k⭐)
- `task management open source kanban` — 50k+ 结果，最高: plane (50k⭐)

## 参考项目分析

### Plane (50,411⭐) — Jira/Linear 替代品
- **核心特性**: 看板视图、甘特图、循环视图、模块管理
- **可借鉴**: 看板视图是其核心 UX，任务按状态分列展示
- **实现难度**: ⭐ (仅需前端 + 已有后端支持)
- **决策**: 采用看板视图作为 harness-remote 的新 Dashboard 视图

### Headroom (15,346⭐) — MCP 工具输出压缩
- **核心特性**: 压缩 MCP 工具输出，减少 60-95% token 消耗
- **可借鉴**: 对大响应体进行摘要/压缩
- **实现难度**: ⭐⭐⭐ (需要修改所有工具的响应格式)
- **决策**: 留作后续 phase

### Taskcafe (5,199⭐) — 开源项目管理
- **核心特性**: 看板、标签、成员管理
- **可借鉴**: 看板的卡片设计和交互模式
- **实现难度**: ⭐
- **决策**: 已在 Phase 40 中实现

### Nocturne Memory (1,171⭐) — MCP 长期记忆
- **核心特性**: 可回滚的长期记忆服务器
- **可借鉴**: 代理记住之前的交互上下文
- **实现难度**: ⭐⭐⭐⭐
- **决策**: 留作后续 phase

## 实现决策

### 为什么选择看板视图
1. **用户价值高**: 看板是任务管理工具中最直观的视图，Plane/Linear/ClickUp 都将其作为核心功能
2. **实现成本低**: 后端已有完整的任务查询能力（状态过滤、优先级排序），只需新增一个分组查询
3. **AI 代理友好**: MCP 工具 `get_kanban_board` 让代理可以快速了解任务工作流分布
4. **架构一致**: 完全遵循 types → store → routes → client → tools 分层架构

### 技术方案
- **Store**: 按 5 种状态分组查询，每列独立 LIMIT
- **排序**: pinned → priority (urgent first) → created_at DESC
- **归档**: 自动排除 archived_at IS NULL 的任务
- **Dashboard**: 4 列看板布局，每列显示任务卡片（ID、命令、优先级、标签、截止日期）

## 下一步研究方向
1. **Token 压缩** — 参考 headroom，对 MCP 工具大响应体进行摘要
2. **看板拖拽** — 前端拖拽改变任务状态（需要 PATCH 端点）
3. **长期记忆** — 参考 nocturne_memory，让代理记住交互上下文
4. **MCP Gateway** — 参考 mcp-gateway-registry，企业级 MCP 路由
