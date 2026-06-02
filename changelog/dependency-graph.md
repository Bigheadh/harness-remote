# Change Log: Task Dependency Graph Endpoint

**Date:** 2026-06-03
**Feature:** Full dependency tree endpoint (GET /api/tasks/:id/dependency-graph)
**Files Modified:** 6
**Lines Added:** ~120
**Lines Removed:** 0

## Overview

Added a new endpoint and MCP tool that returns the complete dependency graph for a task, recursively traversing all upstream (prerequisites) and downstream (dependents) tasks. Returns a tree structure suitable for visualization, along with edge lists and depth statistics.

## File-by-File Changes

### 1. `src/shared/types.ts` — New shared types

**Added (after Task interface, line 45):**
- `DependencyTreeNode` interface — tree node with taskId, status, commandText, and recursive children
- `DependencyGraph` interface — root task info, upstream/downstream trees, depth stats, total node count, flat edge list

**Reason:** Shared types define the contract between server (store/routes) and client (MCP tools). Both layers reference these interfaces.

**Risk:** None — purely additive types, no existing code modified.

### 2. `src/server/tasks/store.ts` — New store method

**Added (line 121):** `getDependencyGraph(taskId: string): Promise<DependencyGraph>` to the `TaskStore` interface.

**Added (line 1432, after `listReadyTasks`):** Full implementation:
- Verifies root task exists
- `buildUpstream(id, depth)` — recursively queries `task_dependencies` WHERE task_id = ?, builds tree nodes with status/commandText, collects edges
- `buildDownstream(id, depth)` — recursively queries WHERE depends_on_task_id = ?, builds tree nodes, collects edges
- Handles deleted tasks gracefully (returns placeholder node)
- Tracks visited nodes for total count, max depth for both directions
- Returns complete `DependencyGraph` with root, upstream, downstream, edges, stats

**Reason:** The recursive traversal is done in the store (not routes) to keep the SQL access pattern encapsulated. Uses existing `selectTaskById` and `rowToTask` helpers.

**Risk:** Low. Circular dependencies are prevented at the DB level (existing `setDependencies` check), so the recursive traversal won't infinite-loop. Visited set prevents double-counting.

### 3. `src/server/tasks/routes.ts` — New route

**Added (line 1562, after DELETE /api/tasks/:id/dependencies/:depId):**
- `GET /api/tasks/:id/dependency-graph` — requires `tasks.read` permission
- Validates task exists, returns `{ graph: DependencyGraph }`
- Returns 404 if task not found

**Reason:** Follows the existing dependency route pattern (auth → validate → call store → return).

**Risk:** None — new route, no existing routes modified.

### 4. `src/mcp-server/client.ts` — New client method

**Added (line 55):** `getDependencyGraph(taskId: string): Promise<DependencyGraph>` to `TaskApiClient` interface.

**Added (line 691, after `listReadyTasks`):** HTTP implementation — fetches `GET /api/tasks/:id/dependency-graph`, extracts `graph` from response.

**Reason:** MCP tools call client methods, which call the HTTP API. This is the standard pattern.

**Risk:** None — new method, no existing methods modified.

### 5. `src/mcp-server/tools.ts` — New MCP tool + helper

**Added (top of file, lines 4-19):**
- `countReadyNodes(graph)` helper — recursively walks upstream tree to count pending tasks with all prerequisites met
- Imports `DependencyGraph` and `DependencyTreeNode` types

**Added (line 1500, after `list_ready_tasks`):**
- `get_task_dependency_graph` tool — takes `taskId`, calls `client.getDependencyGraph()`, returns full graph with ready-count summary message

**Reason:** Provides a discoverable MCP tool for Codex CLI to query dependency graphs. The ready count is a useful human-readable summary.

**Risk:** None — new tool, no existing tools modified.

### 6. `test/mcp-server/tools.test.ts` — Test updates

**Added (line 522, after `listReadyTasks` mock):** `getDependencyGraph` mock method returning a minimal single-node graph.

**Updated (line 869):** Tool count assertion from 51 → 52.

**Reason:** Mock client must implement all `TaskApiClient` interface methods. Tool count must match actual registrations.

**Risk:** None — additive mock + count bump.

## Structural Summary

- **New types:** `DependencyTreeNode`, `DependencyGraph`
- **New store method:** `getDependencyGraph()`
- **New route:** `GET /api/tasks/:id/dependency-graph`
- **New client method:** `getDependencyGraph()`
- **New MCP tool:** `get_task_dependency_graph`
- **New helper:** `countReadyNodes()`

## Risk Assessment

- **Low risk.** All changes are purely additive — no existing code modified.
- Circular dependency prevention is already in place (setDependencies checks for cycles).
- Recursive traversal handles deleted tasks gracefully.
- No new dependencies introduced.

## Verification

1. `npm run typecheck` — ✅ passes (EXIT: 0)
2. `npm run build` — ✅ passes (EXIT: 0)
3. `npm run test` — ✅ 243 tests pass across 10 test files (EXIT: 0)
