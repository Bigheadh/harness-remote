# Date Range Filter

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-06-04 |
| Task | Add date range filter to dashboard toolbar |
| Files Modified | 3 |
| Lines Added | ~60 |
| Lines Removed | ~5 |

## File Changes

### 1. src/server/tasks/store.ts

**Change: Add `from`/`to` date parameters to `listTasks` method**

- **Before**: `listTasks(status?, limit?, deviceId?)` — only supported status and device filters, no date range
- **After**: `listTasks(status?, limit?, deviceId?, from?, to?)` — when `from` or `to` is provided, builds dynamic SQL with `created_at` range conditions
- **Location**: Lines 39-40 (interface), Lines 648-697 (implementation)
- **Reason**: Dashboard needs server-side date range filtering for large task lists. Using dynamic SQL when date params are present avoids modifying the existing prepared statement.
- **Impact**: No behavioral change when `from`/`to` are not provided. When provided, queries include `created_at >= ?` and/or `created_at <= ?` conditions with proper sorting (pinned first, then priority, then created_at DESC).
- **Risk**: Low — additive change with optional parameters. Existing callers are unaffected.

### 2. src/server/tasks/routes.ts

**Change: Pass `from`/`to` query parameters from HTTP request to store**

- **Before**: Route handler destructured `{ status, limit, deviceId }` from query params
- **After**: Also destructures `{ from, to }` and passes them to `store.listTasks()`
- **Location**: Lines 333-342
- **Reason**: Exposes the date range filtering capability to the HTTP API
- **Impact**: `GET /api/tasks?from=...&to=...` now filters by creation date range
- **Risk**: Low — optional query params, backward compatible

### 3. src/server/dashboard/templates/dashboard.ts

**Change: Add date range inputs to dashboard toolbar and wire up filtering**

- **Before**: Toolbar had search, status filter, priority filter, tag filter
- **After**: Also includes From/To date inputs that trigger server-side filtering
- **Location**: CSS (lines 122-136), HTML (lines 389-396), JS state (lines 470-471), JS loadTasks (lines 494-499), JS event listeners (lines 974-983)
- **Reason**: Users need to filter tasks by creation date for reporting and finding older tasks
- **Impact**: Selecting a date range sends `from`/`to` params to the API. Tasks created on the "to" date are included (by appending T23:59:59). Changing dates triggers a fresh API load.
- **Risk**: Low — UI-only change with no effect on other features

## Structural Summary

- **Added**: Date range filter UI (From/To date inputs in toolbar)
- **Added**: Server-side date filtering in `listTasks` store method
- **Added**: `from`/`to` query parameter support in `GET /api/tasks` route
- **Modified**: `TaskStore` interface with 2 new optional parameters

## Verification

- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run test` ✅ (270/270 tests pass)
