# Research: Task Watchers / Subscribers Feature

## Date: 2026-06-07
## Direction: User notification subscriptions for task updates

## Gap Analysis

### What's missing
The project has SSE streaming for real-time updates and Feishu notifications for SLA breaches, but there's no way for users to subscribe to specific task updates. In popular task management tools:
- **Linear**: Users can "watch" tasks and get notified of all changes
- **Plane**: Has subscriber/notification system
- **GitHub Issues**: Watch/star notifications for issue updates
- **Jira**: Watchers get email notifications on issue changes

### Current notification paths
- SSE stream broadcasts task events to all connected clients
- Feishu notifications only for SLA breaches
- No per-task notification routing

## Implementation Plan

### Phase 49: Task Watchers
1. **Shared types**: Add `TaskWatcher` interface
2. **Store layer**: Add `task_watchers` table, CRUD methods
3. **API routes**: POST/DELETE /api/tasks/:id/watchers, GET /api/tasks/:id/watchers
4. **MCP client**: Add watchTask, unwatchTask, listTaskWatchers methods
5. **MCP tools**: Add watch_task, unwatch_task, list_task_watchers tools
6. **SSE integration**: Notify watchers on task status changes
7. **Tests**: Store tests + MCP tool tests

## Reference Projects
- **Linear** (25k+ stars): Task watchers with notification preferences
- **Plane** (50k+ stars): Subscriber management for task updates
- **GitHub Issues**: Watch/star system with email notifications
- **Jira**: Watcher management with configurable notification schemes

## Difficulty: ⭐⭐⭐ (3/5)
- Store + routes + MCP tools are straightforward
- SSE integration needs careful design
- No external dependencies required

## Next Steps
1. Add TaskWatcher type to shared/types.ts
2. Add task_watchers table to store
3. Add API routes for watcher management
4. Add MCP client methods
5. Add MCP tools
6. Integrate with SSE broadcaster
7. Write tests
