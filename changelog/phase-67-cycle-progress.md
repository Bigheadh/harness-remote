# Phase 67: Cycle Progress / Burndown

## Date
2026-06-08

## Summary
Added cycle progress and burndown chart data — a high-value feature inspired by Plane (50k+ stars) and Linear's sprint tracking. AI agents can now query cycle health metrics including completion percentage, velocity, status/priority breakdowns, and burndown chart data.

## Files Modified

### src/shared/types.ts
- **Added**: `BurndownDataPoint` interface (date, remaining, completed, ideal)
- **Added**: `CycleStatusBreakdown` interface (pending/picked/running/done/failed counts)
- **Added**: `CyclePriorityBreakdown` interface (low/normal/high/urgent counts)
- **Added**: `CycleProgress` interface (full burndown + progress data)
- **Reason**: These types define the contract for cycle progress data across all layers
- **Impact**: No breaking changes — new interfaces only

### src/server/tasks/store.ts
- **Added**: `getCycleProgress(cycleId)` method to `TaskStore` interface and implementation
- **Added**: SQL queries for cycle task aggregation, completion date tracking
- **Added**: Burndown computation logic (actual vs ideal remaining over time)
- **Added**: Velocity calculation (tasks completed per day)
- **Reason**: Provides the data layer for cycle progress tracking
- **Impact**: No existing methods changed — new method only

### src/server/tasks/routes.ts
- **Added**: `GET /api/cycles/:id/progress` route with auth middleware
- **Reason**: Exposes cycle progress data via HTTP API
- **Impact**: No existing routes changed — new route only

### src/mcp-server/client.ts
- **Added**: `getCycleProgress(cycleId)` method to `TaskApiClient` interface and implementation
- **Added**: HTTP GET call to `/api/cycles/:id/progress`
- **Reason**: Client layer for AI agents to access cycle progress
- **Impact**: No existing methods changed — new method only

### src/mcp-server/tools.ts
- **Added**: `get_cycle_progress` MCP tool registration
- **Description**: "Get burndown and progress data for a cycle (sprint). Returns completion percentage, velocity (tasks/day), status breakdown, priority breakdown, burndown chart data (actual vs ideal), and time tracking summary (estimated vs actual minutes). Use this to track sprint health and generate burndown charts."
- **Input**: `cycleId` (required string)
- **Reason**: AI agents can now query cycle health and generate burndown charts
- **Impact**: Tool count incremented from 139 to 140

### test/mcp-server/tools.test.ts
- **Added**: Mock `getCycleProgress` method returning sample burndown data
- **Added**: 3 new tests for `get_cycle_progress` tool (registration, burndown data, error case)
- **Updated**: Tool count assertion from 139 to 140
- **Reason**: Ensures new tool works correctly and doesn't break existing tests
- **Impact**: Test count increased from 502 to 505

### FEATURES.md
- **Added**: Phase 67 section with completion checkboxes
- **Reason**: Track feature completion
- **Impact**: Documentation only

### research/2026-06-08-cycle-progress-burndown.md
- **Added**: Research notes on cycle progress feature
- **Reason**: Document research direction and implementation decisions
- **Impact**: Documentation only

## Risk Assessment
- **Low Risk**: All changes are additive — no existing code modified
- **No Breaking Changes**: New interfaces, methods, routes, and tools only
- **Test Coverage**: 3 new tests covering registration, data, and error handling
- **Build Status**: Typecheck ✅, Build ✅, Tests ✅ (505 passed)

## Verification
1. `npm run typecheck` — passes
2. `npm run build` — passes
3. `npm test` — 505 tests pass (all 11 test files)
4. `grep -c "registerTool" src/mcp-server/tools.ts` — returns 140
5. `grep "get_cycle_progress" src/mcp-server/tools.ts` — tool registered
6. `grep "getCycleProgress" src/mcp-server/client.ts` — client method exists
7. `grep "getCycleProgress" src/server/tasks/store.ts` — store method exists
