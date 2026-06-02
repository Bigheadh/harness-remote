# Changelog: Task Statistics & Analytics Endpoint

**Date**: 2026-06-02
**Feature**: GET /api/stats/summary — comprehensive task statistics and analytics
**Files modified**: 5
**Lines added**: 179 / Lines removed: 1

---

## Overview Table

| Item | Value |
|------|-------|
| Date | 2026-06-02 |
| Task | Phase 22 — v5 Observability & Analytics |
| Files | 5 |
| Added | +179 |
| Removed | -1 |

---

## File-by-File Changes

### 1. `src/shared/types.ts` (+26 lines)

**Change**: Added `TaskStats` interface to shared types.

**Before**: No `TaskStats` type existed.

**After**:
```typescript
export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  dailyCreated: Array<{ date: string; count: number }>;
  dailyCompleted: Array<{ date: string; count: number }>;
  avgResolutionMinutes: number | null;
  medianResolutionMinutes: number | null;
  successRate: number | null;
  topTags: Array<{ tag: string; count: number }>;
  overdueCount: number;
  computedAt: string;
}
```

**Reason**: Provides a shared type for the analytics endpoint response, consumed by both the store implementation and the routes layer.

**Impact**: No breaking changes. Additive type only.

**Risk**: Low — purely additive type definition.

**Verification**: `npm run typecheck` passes.

---

### 2. `src/server/tasks/store.ts` (+111 lines)

**Change**: Added `getTaskStats()` method to the `TaskStore` interface and its SQLite implementation.

**Before**: No `getTaskStats()` method existed on the store.

**After**: The store provides:
- Total task count
- Count by status (pending/picked/running/done/failed)
- Count by priority (low/normal/high/urgent)
- Daily created/completed (last 7 days) via SQLite DATE grouping
- Average and median resolution time for recently completed tasks
- Success rate (done / (done + failed)) as percentage
- Top 10 tags by frequency (parsed from JSON arrays)
- Overdue count (tasks past due date, not in terminal state)

**Reason**: Core analytics method needed by the stats endpoint. Uses efficient SQL aggregations rather than loading all tasks into memory.

**Impact**: Adds a new method to the `TaskStore` interface — all existing store implementations already satisfy the interface since this is additive.

**Risk**: Low — new method, no existing behavior changed. SQL queries use indexed columns where possible.

**Verification**: `npm run typecheck` passes. Method exercises SQLite aggregation functions.

---

### 3. `src/server/stats/routes.ts` (new file, 36 lines)

**Change**: New route module for `/api/stats/summary` endpoint.

**Before**: No stats routes module existed.

**After**: Registers `GET /api/stats/summary` with:
- RBAC authorization (requires `dashboard.read` permission)
- Calls `store.getTaskStats()` and returns the result
- Error handling with appropriate HTTP 500 response

**Reason**: Provides a single endpoint for comprehensive task analytics, accessible to dashboard viewers and admin users.

**Impact**: New endpoint only. No existing endpoints affected.

**Risk**: Low — new route, auth-gated.

**Verification**: `npm run typecheck` passes. Endpoint follows existing auth middleware pattern.

---

### 4. `src/server/index.ts` (+2 lines)

**Change**: Import and register the new stats routes module.

**Before**: `registerStatsRoutes` was not imported or called.

**After**:
```typescript
import { registerStatsRoutes } from "./stats/routes.js";
// ...
registerStatsRoutes(server, store, config.personalToken);
```

**Reason**: Wires the new stats routes into the Fastify server startup.

**Impact**: Minimal — one import + one function call added after existing route registrations.

**Risk**: Low — additive wiring only.

**Verification**: `npm run typecheck` passes.

---

### 5. `FEATURES.md` (+5 lines)

**Change**: Added Phase 22 section with v5 Observability & Analytics items.

**Before**: Phase 21 was the last tracked phase.

**After**:
```markdown
## Phase 22: v5 Observability & Analytics
- [x] Task statistics and analytics endpoint (GET /api/stats/summary)
- [ ] Server-sent events (SSE) for real-time task updates (/api/tasks/stream)
- [ ] Prometheus-compatible metrics endpoint (/metrics)
```

**Reason**: Tracks the new feature set and marks the first item as complete.

**Risk**: None — documentation only.

---

## Structural Summary

- **New files**: 1 (`src/server/stats/routes.ts`)
- **New types**: 1 (`TaskStats`)
- **New store methods**: 1 (`getTaskStats`)
- **New API endpoints**: 1 (`GET /api/stats/summary`)
- **Modified files**: 4

---

## Risk Assessment

- **Data integrity**: All queries are read-only SELECT aggregations. No writes.
- **Performance**: Uses SQL GROUP BY and aggregation functions, not in-memory iteration. Should be fast even with thousands of tasks.
- **Backward compatibility**: Entirely additive — no existing behavior changed.
- **Auth**: Endpoint requires `dashboard.read` permission, consistent with other analytics endpoints.

---

## Verification Steps

1. `npm run typecheck` — passes (exit 0)
2. `npm run build` — passes (exit 0)
3. `npm run test` — 223 tests pass (exit 0)
4. New endpoint follows existing route patterns and auth middleware
