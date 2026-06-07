# Phase 68: Global Activity Feed

## Overview
| Item | Value |
|------|-------|
| Date | 2026-06-08 |
| Task | Add global activity feed across all tasks |
| Files Modified | 4 |
| Lines Added | ~120 |
| Lines Removed | 0 |

## Files Changed

### 1. src/server/tasks/store.ts
- **Change**: Added `getGlobalActivity(limit?)` method to `TaskStore` interface and implementation
- **Before**: Only per-task `getActivityFeed(taskId)` existed
- **After**: New `getGlobalActivity(limit?)` queries across tasks, comments, notes, subtasks, and time entries
- **Reason**: No way to see recent activity across all tasks — only per-task activity was available
- **Impact**: Enables dashboard and MCP tools to show cross-task activity overview

### 2. src/server/tasks/routes.ts
- **Change**: Added `GET /api/activity` route with `tasks.read` permission
- **Before**: No global activity endpoint
- **After**: Returns combined activity feed with `items` and `count` response
- **Reason**: Provides HTTP API for the global activity feed
- **Impact**: Dashboard and external consumers can query recent activity

### 3. src/mcp-server/client.ts
- **Change**: Added `getGlobalActivity(limit?)` to `TaskApiClient` interface and implementation
- **Before**: No client method for global activity
- **After**: HTTP client calls `GET /api/activity` with optional limit parameter
- **Reason**: Enables MCP tools to call the global activity endpoint
- **Impact**: AI agents can query cross-task activity

### 4. src/mcp-server/tools.ts
- **Change**: Added `get_global_activity` MCP tool registration
- **Before**: No tool for global activity
- **After**: Tool returns items, count, and summary message
- **Reason**: Gap pattern #7 — API route existed (after adding it) but no MCP tool
- **Impact**: AI agents can now get project-wide activity overview via MCP

### 5. test/mcp-server/tools.test.ts
- **Change**: Added mock client method, updated tool count (140→141), added 3 tests
- **Before**: Tool count was 140
- **After**: Tool count is 141, 3 new tests for registration, data return, and error handling
- **Reason**: Test coverage for new tool
- **Impact**: Ensures tool contract is validated

## Risk
- Low risk — new read-only endpoint, no mutation of existing data
- SQL queries use JOIN with existing tables, no schema changes

## Verification
- `npm run build` passes
- `npm test` — all 508 tests pass (11 test files)
