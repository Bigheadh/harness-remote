# Activity Feed — Combined Chronological Timeline

**Date**: 2026-06-03  
**Feature**: GET /api/tasks/:id/activity  
**Phase**: 25 (v8 Task Safety & Subtasks)

## Overview

Added a unified activity feed endpoint that combines all task-related events into a single chronological timeline. This provides a complete history of everything that happened to a task — creation, status changes, comments, notes, subtask events, and more.

## Changes

### src/shared/types.ts
- **Added** `ActivityFeedItem` interface (lines 357-372)
  - Fields: `type`, `timestamp`, `actor`, `actorType`, `summary`, `details`
  - Covers all event types: task lifecycle, comments, notes, subtasks, audit events

### src/server/tasks/store.ts
- **Added** `getActivityFeed(taskId, limit?)` to `TaskStore` interface (line 136)
- **Implemented** `getActivityFeed` method (lines 2347-2427)
  - Queries task creation event from `tasks` table
  - Queries comments from `task_comments` table
  - Queries notes from `task_notes` table
  - Queries subtask creation/result events from `task_subtasks` table
  - Sorts all items by timestamp ascending
  - Applies configurable limit (default 50, max 200)

### src/server/tasks/routes.ts
- **Added** `ActivityFeedItem` import (line 6)
- **Added** `formatAuditSummary()` helper function (lines 29-89)
  - Converts audit log entries to human-readable summaries
  - Handles all audit action types with contextual messages
- **Added** `GET /api/tasks/:id/activity` route (lines 2488-2540)
  - Requires `tasks.read` permission
  - Merges store-owned activity (comments, notes, subtasks) with audit log entries
  - Returns unified chronological timeline with configurable limit
  - Query param: `?limit=N` (default 50, max 200)

### FEATURES.md
- **Updated** Phase 25: marked "Activity feed" as `[x]`

## Risk

- **Low**: Read-only endpoint, no data mutations
- **Low**: Audit log query is bounded by limit
- **Low**: Store method queries are indexed (task_comments.task_id, task_notes.task_id, task_subtasks.parent_task_id)

## Verification

```bash
npm run typecheck   # PASS
npm run build       # PASS
npm run test        # 243/243 PASS
```

## API Usage

```bash
# Get activity feed for a task
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/tasks/{taskId}/activity?limit=20"

# Response:
{
  "items": [
    {
      "type": "task.created",
      "timestamp": "2026-06-03T00:00:00.000Z",
      "actor": "ou_user123",
      "actorType": "feishu",
      "summary": "Task created: deploy the new feature...",
      "details": { "commandText": "deploy the new feature" }
    },
    {
      "type": "task.status_changed",
      "timestamp": "2026-06-03T00:05:00.000Z",
      "actor": "admin",
      "actorType": "api",
      "summary": "Status changed: pending → running",
      "details": { "from": "pending", "to": "running" }
    }
  ],
  "count": 2
}
```
