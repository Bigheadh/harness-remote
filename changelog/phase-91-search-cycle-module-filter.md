# Phase 91: Cycle & Module Filtering for Search Tasks

## Date
2026-06-16

## Summary
Added `cycleId` and `moduleId` filter parameters to the `search_tasks` MCP tool, the `/api/tasks/search` API endpoint, and the underlying store queries. This closes gap pattern #6 (missing filter parameters) — the Task data model already had `cycle_id` and `module_id` columns, but the search function didn't expose them as queryable filters.

## Files Modified

### 1. `src/server/tasks/store.ts`
**Changes:**
- `SearchOptions` interface: added `cycleId?: string` and `moduleId?: string` fields
- `searchTasks()` method: added two new WHERE clauses for `cycle_id = ?` and `module_id = ?`
- `searchAllTasksForExport()` method: added the same two WHERE clauses for consistency

**Before:**
```typescript
export interface SearchOptions {
  q?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  from?: string;
  to?: string;
  limit?: number;
  deviceId?: string;
  tags?: string[];
}
```

**After:**
```typescript
export interface SearchOptions {
  q?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  from?: string;
  to?: string;
  limit?: number;
  deviceId?: string;
  tags?: string[];
  cycleId?: string;
  moduleId?: string;
}
```

**Impact:** Both `searchTasks()` and `searchAllTasksForExport()` now support filtering by cycle and module ID. The dynamic SQL builder appends `AND cycle_id = ?` / `AND module_id = ?` conditions when these parameters are provided.

### 2. `src/server/tasks/routes.ts`
**Changes:**
- Search route destructuring: added `cycleId` and `moduleId` to query parameter extraction
- Type annotation updated with new optional fields
- `store.searchTasks()` call: passes `cycleId` and `moduleId` through

**Impact:** The `GET /api/tasks/search` endpoint now accepts `?cycleId=xxx&moduleId=yyy` query parameters.

### 3. `src/mcp-server/client.ts`
**Changes:**
- `TaskApiClient` interface: added `cycleId?: string` and `moduleId?: string` to `searchTasks` options
- Client implementation: added `params.set("cycleId", ...)` and `params.set("moduleId", ...)` URL parameter construction

**Impact:** MCP clients can now pass cycle/module filters when searching tasks.

### 4. `src/mcp-server/tools.ts`
**Changes:**
- `search_tasks` tool description updated to mention "cycle, and module" filtering
- Input schema: added `cycleId` and `moduleId` Zod string fields with descriptive `.describe()` text
- Handler destructuring: added `cycleId` and `moduleId` to the args extraction
- Client call: passes `cycleId` and `moduleId` through to `client.searchTasks()`

**Impact:** AI agents can now filter search results by cycle (sprint) ID or module (epic) ID.

### 5. `test/mcp-server/tools.test.ts`
**Changes:**
- Mock client `searchTasks` signature: added `cycleId?: string` and `moduleId?: string` parameters

**Impact:** Mock client satisfies the updated `TaskApiClient` interface.

## Risk
- **Low risk** — All new parameters are optional; existing behavior is unchanged when they're not provided.
- No new database tables or migrations needed (columns already exist).
- No new API routes or MCP tools added (existing tool enhanced).

## Verification
1. `npm run typecheck` — passes ✅
2. `npm run build` — passes ✅
3. `npm test` — 572/572 tests pass ✅
4. Manual: `GET /api/tasks/search?cycleId=cycle_123` filters tasks by cycle
5. Manual: `GET /api/tasks/search?moduleId=module_456` filters tasks by module
6. MCP: `search_tasks({ cycleId: "cycle_123" })` returns only tasks in that cycle
