# Phase 86: Filtered CSV Export

## Date
2026-06-10

## Summary
Added filter parameters to the CSV export endpoint, enabling users and AI agents to export subsets of tasks matching specific criteria (status, priority, tags, date range, text search, device).

## Files Modified

### 1. src/server/tasks/store.ts
**Change**: Added `searchAllTasksForExport(options: SearchOptions)` method to store interface and implementation.
**Before**: Only `getAllTasks()` (no filters) and `searchTasks()` (capped at 100 rows) existed for task retrieval.
**After**: New method uses identical filter logic as `searchTasks` but without the 100-row limit, returning all matching tasks.
**Reason**: CSV export needs to return all matching tasks, not just the first 100. The existing `searchTasks` has a hard `Math.min(options.limit ?? 20, 100)` cap that truncates large exports.
**Impact**: No breaking changes. New method is additive to the store interface.

### 2. src/server/tasks/routes.ts
**Change**: Modified `GET /api/tasks/export.csv` to accept optional query parameters: `status`, `priority`, `tags` (comma-separated), `from`, `to`, `q`, `deviceId`.
**Before**: Always called `store.getAllTasks()` with no filtering.
**After**: When any filter param is present, uses `store.searchAllTasksForExport()` with the parsed filters. Falls back to `getAllTasks()` when no filters are provided (backward compatible).
**Reason**: Users need to export specific subsets of tasks for reporting (e.g., all urgent tasks, tasks created this week, tasks with specific tags).
**Impact**: Backward compatible — existing calls without query params work identically.

### 3. src/mcp-server/client.ts
**Change**: Added `exportTasksCsv(filters?)` method to `TaskApiClient` interface and implementation.
**Before**: Only `exportTasks()` existed (JSON backup export).
**After**: New method builds URL with filter query params and fetches CSV text from `/api/tasks/export.csv`.
**Reason**: MCP tools need a client method to call the filtered CSV export endpoint.
**Impact**: Additive to client interface. Existing code unaffected.

### 4. src/mcp-server/tools.ts
**Change**: Added `export_tasks_csv` MCP tool registration with Zod input schema for all filter parameters.
**Before**: Only `export_tasks` (JSON backup) existed.
**After**: New tool accepts optional `status`, `priority`, `tags`, `from`, `to`, `q`, `deviceId` filters and returns CSV text with row count.
**Reason**: AI agents need to export filtered task data for analysis, reporting, and integration with external tools.
**Impact**: New tool registration increases tool count from 155 to 156.

### 5. src/server/dashboard/templates/dashboard.ts
**Change**: Updated `exportCSV()` function to build URL with current filter state.
**Before**: Always opened `/api/tasks/export.csv` with no parameters.
**After**: Reads `currentFilter`, `currentPriorityFilter`, `tagQuery`, `dateFrom`, `dateTo`, and `searchQuery` variables and passes them as query parameters.
**Reason**: Dashboard users expect CSV export to respect their current filter view (e.g., if filtering by "urgent" priority, the export should only include urgent tasks).
**Impact**: No breaking changes. Dashboard CSV export now exports the filtered view.

### 6. test/mcp-server/tools.test.ts
**Change**: Updated tool count assertion (155 → 156), added mock `exportTasksCsv` method, added 4 tests for `export_tasks_csv`.
**Before**: 155 tools expected, no mock for `exportTasksCsv`.
**After**: 156 tools expected, mock returns CSV header string, tests cover registration, no-filter export, status-filter export, and error handling.
**Reason**: Ensures the new tool is properly registered and the mock client satisfies the updated interface.
**Impact**: Test count increased from 560 to 564.

### 7. FEATURES.md
**Change**: Added Phase 86 section with all implementation items marked `[x]`.
**Reason**: Tracks feature completion for the evolution cycle.

## Risk
- **Low**: All changes are additive. Existing CSV export without filters is unchanged.
- **Medium**: The `searchAllTasksForExport` method has no row limit — exporting millions of tasks could use significant memory. Mitigated by the fact that this project typically handles hundreds to low thousands of tasks.

## Verification
- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] `npm test` — 564 tests pass (4 new)
- [x] Dashboard CSV export button passes current filters
- [x] MCP tool accepts all filter parameters
- [x] Backward compatible — no-filter calls work identically
