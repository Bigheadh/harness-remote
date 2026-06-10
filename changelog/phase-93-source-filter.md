# Phase 93: Source Filter for Search and Export Tasks

**Date**: 2026-06-11
**Risk**: Low — adds optional filter parameter to existing endpoints, no breaking changes
**Verification**: typecheck + build + all 575 tests pass

## Overview
Added `source` filter parameter to task search and CSV export endpoints, enabling filtering by task origin (feishu, web, mcp). This fills a gap where the `source` field existed on Task objects but couldn't be used as a query filter.

## Files Modified

### src/server/tasks/store.ts
- **SearchOptions interface** (line 30): Added `source?: string` field
- **searchTasks()** (line 978-981): Added WHERE clause `source = ?` when source is provided
- **searchAllTasksForExport()** (line 3232-3235): Added WHERE clause `source = ?` when source is provided

### src/server/tasks/routes.ts
- **GET /api/tasks/search** (line 537): Added `source` to destructured query params and type definition
- **Source validation** (line 578-582): Added validation against allowed values: feishu, web, mcp
- **Store call** (line 584): Passed `source` to `store.searchTasks()`
- **GET /api/tasks/export.csv** (line 1209): Added `query.source` to `hasFilters` check and `searchAllTasksForExport()` call

### src/mcp-server/client.ts
- **TaskApiClient interface** (line 20): Added `source?: string` to searchTasks options
- **searchTasks implementation** (line 270, 287): Added `source` to type definition and URLSearchParams
- **exportTasksCsv interface** (line 87): Added `source?: string` to filters type
- **exportTasksCsv implementation** (line 1252, 1260): Added `source` to type definition and URLSearchParams

### src/mcp-server/tools.ts
- **search_tasks tool** (line 85): Updated description to mention source filtering
- **search_tasks inputSchema** (line 131-134): Added `source` enum field with description
- **search_tasks handler** (line 136, 138): Added `source` to destructuring and client call
- **export_tasks_csv tool** (line 2432): Updated description to mention source filtering
- **export_tasks_csv inputSchema** (line 2441): Added `source` enum field with description
- **export_tasks_csv handler** (line 2454): Added `source` to client call

## Impact
- AI agents can now filter tasks by origin (feishu/web/mcp) in search and export
- Dashboard CSV export supports source filtering via query parameter
- No breaking changes — source is optional in all endpoints
