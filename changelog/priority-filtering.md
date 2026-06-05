# Phase 36: Priority Filtering for Task Listing & Search

**Date:** 2026-06-05
**Task:** Add priority filtering to task listing and search endpoints across all layers
**Files Modified:** 4
**Lines Added:** ~45
**Lines Removed:** ~10

## Overview

Users have priority on tasks (low/normal/high/urgent) but could not filter by priority
in task listings or search. This phase adds `priority` as a filter parameter across the
entire stack: store → API routes → MCP client → MCP tools.

## File-by-File Changes

### 1. `src/server/tasks/store.ts`

**Changes:**
- Added `priority?: TaskPriority` to `SearchOptions` interface (line 22)
- Updated `TaskStore.listTasks()` interface signature to accept `priority?: TaskPriority` (line 41)
- Updated `listTasks()` implementation to use dynamic SQL path when priority is provided (line 651)
- Added `priority = ?` condition to dynamic SQL path in `listTasks()` (lines 671-674)
- Added `priority = ?` condition to `searchTasks()` (lines 714-717)

**Before:** `listTasks` and `searchTasks` had no way to filter by priority
**After:** Both methods accept an optional priority filter

### 2. `src/server/tasks/routes.ts`

**Changes:**
- Added `priority` to query parameter destructuring on `GET /api/tasks` (line 337)
- Added priority validation (validPriorities check) on `GET /api/tasks` (lines 339-343)
- Added `priority as TaskPriority | undefined` to `store.listTasks()` call (line 345)
- Added `priority` to query parameter destructuring on `GET /api/tasks/search` (line 424)
- Added priority validation on `GET /api/tasks/search` (lines 440-444)
- Added `priority: priority as TaskPriority | undefined` to `store.searchTasks()` call (line 461)

**Before:** API endpoints had no priority query parameter
**After:** Both endpoints accept `?priority=urgent` etc. with validation

### 3. `src/mcp-server/client.ts`

**Changes:**
- Updated `TaskApiClient.listTasks()` interface to accept `priority?: string` (line 6)
- Updated `TaskApiClient.searchTasks()` options to include `priority?: string` (line 11)
- Updated `listTasks()` implementation to add `priority` to URL params (line 124)
- Updated `searchTasks()` implementation to include `priority` in options type (line 149)
- Added `priority` to searchTasks URL params (line 160)

**Before:** MCP client had no way to pass priority to the server
**After:** Both client methods pass priority as a query parameter

### 4. `src/mcp-server/tools.ts`

**Changes:**
- Added `priority` enum parameter to `list_tasks` tool input schema (lines 46-49)
- Updated `list_tasks` handler to destructure and pass `priority` (lines 52, 56)
- Updated `search_tasks` description to mention priority (line 85)
- Added `priority` enum parameter to `search_tasks` tool input schema (lines 95-98)
- Updated `search_tasks` handler to destructure and pass `priority` (lines 125, 128)

**Before:** MCP tools had no priority filter
**After:** Both `list_tasks` and `search_tasks` accept `priority: "urgent"` etc.

### 5. `test/mcp-server/tools.test.ts`

**Changes:**
- Updated mock `listTasks()` to accept `priority?: string` parameter (line 19)
- Updated mock `searchTasks()` options to include `priority?: string` (line 103)

**Before:** Mock client didn't match the updated interface
**After:** Mock matches the new `TaskApiClient` interface

## Risk Assessment

**Low risk.** All changes are additive — new optional parameters with no defaults.
Existing API calls without priority continue to work identically.
No database schema changes required (priority column already exists).

## Verification Steps

1. `npm run typecheck` — passes ✅
2. `npm run build` — passes ✅
3. `npm run test` — 270/270 tests pass ✅
4. Manual: `GET /api/tasks?priority=urgent` should return only urgent tasks
5. Manual: `GET /api/tasks/search?priority=high` should return only high priority tasks
6. Manual: `GET /api/tasks?priority=invalid` should return 400 error
