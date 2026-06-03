# Changelog: Dashboard Data Caching

## Overview

| Date | Task | Files Changed | Lines Added | Lines Removed |
|------|------|---------------|-------------|---------------|
| 2026-06-03 | Dashboard data caching — TTL-based cache for /api/stats/summary and /api/stats/timeseries | 4 | ~130 | ~10 |

## Files Changed

### 1. `src/shared/cache.ts` (NEW)

**Purpose**: Generic in-memory TTL cache utility.

**Changes**:
- Created `TtlCache<V>` class with `get()`, `set()`, `delete()`, `clear()`, `size`, `evictExpired()`, `keys()` methods.
- Supports per-key TTL override and configurable max entries with LRU-style eviction.
- Lazily evicts expired entries on access; optional `evictExpired()` for bulk cleanup.

**Reason**: Dashboard stats endpoints (`/api/stats/summary`, `/api/stats/timeseries`) run expensive aggregate SQL queries on every request. For a dashboard polled frequently, this adds unnecessary load. A TTL cache amortizes the cost.

**Impact**: Purely additive — new utility module, no changes to existing code.

**Risk**: Low. Self-contained module with no dependencies. Cache is in-memory only, so it resets on server restart (acceptable for dashboard stats).

### 2. `src/server/stats/routes.ts` (MODIFIED)

**Purpose**: Stats route handlers now use TTL caching.

**Changes**:
- Added `import { TtlCache } from "../../shared/cache.js"`.
- Created `summaryCache` (TTL: 60s, max 10 entries) and `timeseriesCache` (TTL: 30s, max 50 entries).
- In `GET /api/stats/summary`: check cache before querying store; cache result after query.
- In `GET /api/stats/timeseries`: build cache key from query params (`from|to|interval|metric`); check cache before querying; cache result after.

**Before** (`/api/stats/summary`):
```typescript
const stats = await store.getTaskStats();
return reply.send(stats);
```

**After**:
```typescript
const cached = summaryCache.get("summary");
if (cached) {
  return reply.send(cached);
}
const stats = await store.getTaskStats();
summaryCache.set("summary", stats);
return reply.send(stats);
```

**Reason**: Dashboard UI polls these endpoints every few seconds. Without caching, every poll triggers full SQL aggregations (COUNT, GROUP BY, julianday math). With caching, repeated polls within the TTL window return instantly from memory.

**Impact**: Dashboard becomes responsive. First request still hits the DB; subsequent requests within TTL are served from cache. Different timeseries query parameter combinations get separate cache entries.

**Risk**: Low. Stale data is bounded by TTL (30-60s). For a dashboard, this is acceptable — the data is inherently approximate (point-in-time snapshots).

### 3. `test/shared/cache.test.ts` (NEW)

**Purpose**: Unit tests for the TtlCache utility.

**Changes**:
- 15 tests covering: basic get/set, TTL expiration, per-key TTL override, max entries eviction, delete, clear, size reporting, expired entry cleanup, keys listing, generic typing.

**Reason**: Cache correctness is critical — stale cache could confuse users, broken eviction could leak memory.

**Impact**: 15 new tests added to the test suite.

**Risk**: None — test-only file.

### 4. `FEATURES.md` (MODIFIED)

**Purpose**: Mark the feature as complete.

**Changes**:
- Changed `- [ ] Dashboard data caching — TTL-based cache for /api/stats/summary and /api/stats/timeseries` to `- [x]`.

## Structural Summary

- **New modules**: `src/shared/cache.ts` (generic TTL cache), `test/shared/cache.test.ts` (cache tests)
- **Modified modules**: `src/server/stats/routes.ts` (cache integration), `FEATURES.md` (progress tracking)
- **No deletions or refactoring**

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Stale dashboard data | TTL is short (30-60s). For dashboard use, this is acceptable. |
| Memory leak from cache | `maxEntries` cap prevents unbounded growth. Expired entries are lazily evicted on access. |
| Cache key collisions for timeseries | Key is composed of all 4 query parameters with `|` separator — no collisions. |

## Verification

- [x] `npm run typecheck` — passes
- [x] `npm run build` — passes
- [x] `npm run test` — 261 tests pass (15 new from cache tests)
- [ ] Manual: curl `/api/stats/summary` twice within 60s, verify second response is faster
- [ ] Manual: curl `/api/stats/timeseries?interval=day` with same params twice within 30s, verify caching
