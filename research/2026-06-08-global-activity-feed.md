# Research: Global Activity Feed Feature

## Date: 2026-06-08

## Search Direction
Task management / project management open-source ecosystem

## Projects Researched
1. **makeplane/plane** ⭐50,457 — Open-source Jira/Linear alternative
   - Features: Work Items, Cycles, Modules, Views, Pages, Analytics
   - Key insight: "Pages" for rich text docs, "Modules" for feature groupings
   - harness-remote already has Cycles and Views, but no global activity view

2. **cyanheads/atlas-mcp-server** ⭐474 — Neo4j-powered task management MCP
   - Focuses on graph-based task relationships
   - harness-remote already has task relationships (Phase 58)

3. **refly-ai/refly** ⭐7,350 — Agent skills builder
   - Focuses on workflow orchestration
   - Different paradigm from harness-remote's inbox model

## Feature Decision
**Global Activity Feed** — Cross-task chronological activity timeline

### Rationale
- Plane and Linear both show global activity feeds in their dashboards
- harness-remote had per-task activity (Phase 25) but no cross-task view
- Gap pattern #7: API route + store method existed for per-task, but no global variant
- High user-perceived value — seeing recent project activity at a glance

### Implementation
- Store: queries across 5 tables (tasks, comments, notes, subtasks, time_entries)
- API: `GET /api/activity` with limit parameter
- MCP tool: `get_global_activity` for AI agent access
- Dashboard potential: could be added to analytics view in future phase

## Next Research Directions
- Dashboard analytics improvements (charts, trends)
- Notification system enhancements
- Task template marketplace / sharing
