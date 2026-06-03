# Task Processing Time Tracking

## Overview
Added `pickedAt`, `startedAt`, and `completedAt` timestamp fields to tasks, enabling processing time analytics and Feishu card duration display.

## Files Modified

### src/shared/types.ts
- **Added**: `pickedAt?: string` — ISO 8601 timestamp when task was first picked (moved from pending)
- **Added**: `startedAt?: string` — ISO 8601 timestamp when task started running
- **Added**: `completedAt?: string` — ISO 8601 timestamp when task reached terminal state (done/failed)

### src/server/tasks/store.ts
- **Added**: DB migration columns: `picked_at`, `started_at`, `completed_at` (ALTER TABLE with try/catch for idempotency)
- **Updated**: `rowToTask()` — parses new timestamp fields from DB rows
- **Updated**: `insertTask` prepared statement — includes new columns in INSERT
- **Updated**: `updateTaskStatus()` — automatically sets `picked_at` on pending→picked transition, `started_at` on transition to running, `completed_at` on transition to done/failed
- **Updated**: `saveTaskResult()` — sets `completed_at` if not already set
- **Updated**: `retryTaskStmt` — clears `picked_at`, `started_at`, `completed_at` on retry
- **Updated**: All 3 `insertTask.run()` call sites to pass the new columns

### src/server/stats/routes.ts
- **Added**: `GET /api/stats/processing` endpoint — returns processing time analytics:
  - `totalCompleted`, `avgDurationMs`, `p50DurationMs`, `p95DurationMs` (total time from creation to completion)
  - `avgQueueWaitMs` (time from creation to being picked)
  - `avgProcessingMs`, `p50ProcessingMs`, `p95ProcessingMs` (time from started to completed)
  - `byStatus` breakdown (done/failed counts)

### src/server/feishu/card-builder.ts
- **Updated**: `buildTaskResultCard()` — shows processing duration in result cards when `startedAt` and `completedAt` are available. Format: `< 1min` → seconds, `< 1hr` → minutes, `≥ 1hr` → hours + minutes

## Risk Assessment
- **Low risk**: All new columns are nullable — existing tasks without timestamps work fine
- **Migration safe**: ALTER TABLE wrapped in try/catch — idempotent on existing DBs
- **Retry clears timestamps**: Retried tasks get fresh timestamps on next processing cycle

## Verification
- `npm run typecheck` — ✅ passes
- `npm run build` — ✅ passes  
- `npm run test` — ✅ 267/267 tests pass
