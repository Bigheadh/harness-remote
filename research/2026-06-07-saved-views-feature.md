# Research: Saved Views Feature

**Date**: 2026-06-07
**Phase**: 47
**Reference Projects**: Plane (50k+ stars), Linear

## 搜索关键词

- `mcp server task management` — 找到 atlas-mcp-server (474 stars), todoist-mcp-server (392 stars)
- `plane project management open source` — 找到 makeplane/plane (50428 stars)
- `linear alternative open source issue tracking` — 找到 plane-mobile (214 stars)
- `task management open source 2024 2025` — 综合搜索

## 参考项目分析

### Plane (50428 stars)
- **核心技术**: TypeScript, React, PostgreSQL
- **关键特性**: Work Items, Cycles (sprints), Modules, Views (saved filters), God Mode
- **可借鉴**: "Views" 功能 — 用户可保存自定义过滤器组合为命名视图
- **实现难度**: ⭐⭐ (2/5) — 我们已有完整的过滤器系统，只需添加持久化保存层

### atlas-mcp-server (474 stars)
- **核心技术**: TypeScript, MCP, Neo4j
- **架构**: Project → Task → Knowledge 三节点模型
- **可借鉴**: Knowledge 节点（知识管理），但我们项目定位不同
- **实现难度**: N/A — 架构差异太大

### Linear (闭源参考)
- **关键特性**: Views (saved filters), Cycles, Projects, Labels, Custom Fields
- **可借鉴**: Views 是 Linear 的核心功能之一，用户频繁使用
- **实现难度**: ⭐⭐ — 核心是保存过滤器状态

## 实现决策

### 选择 Saved Views 的理由
1. **高用户价值**: 用户每次查看任务都需要设置过滤器，保存预设可大幅提高效率
2. **技术可行性**: 我们已有完整的过滤器系统（status, priority, tags, device, date range），只需添加持久化层
3. **参考验证**: Plane 和 Linear 都将此作为核心功能
4. **低实现风险**: 纯新增，不修改现有功能

### 设计选择
- **过滤器参数**: 复用现有 `SearchOptions` 的字段集（status, priority, deviceId, tags, fromDate, toDate, query）
- **用户隔离**: 每个视图记录 `createdBy`，支持按用户过滤
- **JSON 存储**: 过滤器以 JSON 字符串存储在 SQLite 中，灵活且易于扩展
- **REST API + MCP**: 同时提供 HTTP API 和 MCP 工具，支持 Dashboard 和 AI 代理两种使用方式

## 下一步研究方向

1. **Task Watchers / Subscribers** — 用户订阅任务更新通知（参考 Linear 的 "Watch" 功能）
2. **Custom Fields** — 用户自定义字段（参考 Linear/Plane 的 Custom Fields）
3. **Task Relations** — 任务间关系（blocks, relates to, duplicates）（参考 Jira 的 Link Types）
4. **Workflow Automations** — 触发器 + 动作（参考 n8n, Activepieces）
