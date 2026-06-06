# Phase 49: Task Watchers (Subscribe to Task Updates)

## Date: 2026-06-07
## Risk: Low — New feature addition, no existing code modified
## Verification: npm run typecheck && npm run build && npm test (387 passed)

## Overview

| Item | Value |
|------|-------|
| Date | 2026-06-07 |
| Task | Implement Task Watchers feature (Phase 49) |
| Files Modified | 5 |
| Lines Added | ~120 |
| Lines Removed | 0 |

## Changes by File

### 1. src/server/tasks/store.ts
- **Type**: Bug fix + Feature implementation
- **Location**: Line 575 (backslash fix), Lines 3060-3085 (new methods)
- **Before**: 
  - Line 575 had doubled backslash corruption: `\\\\n` instead of `\\n`
  - Store interface declared watcher methods but implementation was missing
- **After**:
  - Fixed backslash corruption on CREATE INDEX statement
  - Added `addWatcher(taskId, userId)` — inserts into task_watchers table
  - Added `removeWatcher(taskId, userId)` — deletes from task_watchers table
  - Added `listWatchers(taskId)` — returns all watchers for a task
  - Added `isWatching(taskId, userId)` — checks if user is watching a task
- **Reason**: The TaskWatcher type and table existed from a prior session, but the store methods were never implemented, causing TS2739 build error
- **Impact**: Fixes build error, enables watcher functionality

### 2. src/server/tasks/routes.ts
- **Type**: Feature addition
- **Location**: Lines 3414-3495 (new routes before error handler)
- **Before**: No watcher routes existed
- **After**:
  - `GET /api/tasks/:id/watchers` — list watchers for a task (requires tasks.read)
  - `POST /api/tasks/:id/watchers` — add yourself as a watcher (requires tasks.write)
  - `DELETE /api/tasks/:id/watchers` — remove yourself as a watcher (requires tasks.write)
- **Reason**: Expose watcher management via HTTP API for dashboard and external clients
- **Impact**: New API endpoints, no breaking changes

### 3. src/mcp-server/client.ts
- **Type**: Feature addition
- **Location**: Lines 4-5 (import), 155-157 (interface), 1820-1860 (implementations)
- **Before**: No watcher client methods
- **After**:
  - Added `TaskWatcher` import from shared types
  - Added `watchTask(taskId)` interface method + HTTP implementation
  - Added `unwatchTask(taskId)` interface method + HTTP implementation
  - Added `listTaskWatchers(taskId)` interface method + HTTP implementation
- **Reason**: Enable MCP tools to call watcher API routes
- **Impact**: Extends TaskApiClient interface (3 new methods)

### 4. src/mcp-server/tools.ts
- **Type**: Feature addition
- **Location**: Lines 4329-4420 (new tool registrations)
- **Before**: 105 MCP tools registered
- **After**: 108 MCP tools registered
- **New tools**:
  - `watch_task` — Subscribe to task updates for notifications
  - `unwatch_task` — Unsubscribe from task updates
  - `list_task_watchers` — List all users watching a specific task
- **Reason**: Enable AI agents to manage task subscriptions programmatically
- **Impact**: 3 new MCP tools, no breaking changes

### 5. test/mcp-server/tools.test.ts
- **Type**: Test update
- **Location**: Lines 1509-1540 (mock client), Line 1564-1565 (tool count)
- **Before**: Mock client missing watcher methods, tool count 105
- **After**:
  - Added `watchTask`, `unwatchTask`, `listTaskWatchers` to mock client
  - Updated tool count assertion from 105 to 108
- **Reason**: Mock must satisfy TaskApiClient interface, tool count must match registration
- **Impact**: Tests pass (387/387)

## Structural Summary
- **New**: 3 API routes, 3 MCP client methods, 3 MCP tools, 4 store methods
- **Modified**: 1 import, 1 type assertion
- **Fixed**: 1 backslash corruption in SQL template literal

## Risk Assessment
- **Risk Level**: Low
- **Breaking Changes**: None
- **Data Migration**: New task_watchers table created via IF NOT EXISTS (safe)
- **Rollback**: Remove routes, client methods, and tools; no data loss

## Verification
```bash
cd /opt/harness-remote
npm run typecheck  # PASS
npm run build      # PASS
npm test           # 387 passed, 0 failed
```
