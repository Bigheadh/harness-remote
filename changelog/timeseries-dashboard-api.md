# Enhanced Dashboard API — Time-Series Analytics

**Date**: 2026-06-03  
**Feature**: GET /api/stats/timeseries  
**Files Modified**: 3  
**Lines Added**: ~190  
**Lines Removed**: ~15

## Overview

Added a new `GET /api/stats/timeseries` endpoint that provides time-bucketed analytics data for charting libraries (Chart.js, D3, ECharts, etc.). Supports multiple metrics and granularities with gap-filling for empty time periods.

## Per-File Changes

### 1. `src/shared/types.ts`

| Change | Details |
|--------|---------|
| **Added** `TimeSeriesInterval` type (line ~375) | Union type: `"hour" | "day" | "week" | "month"` — controls bucket granularity |
| **Added** `TimeSeriesMetric` type (line ~376) | Union type: `"created" | "completed" | "resolution_time"` — selects which data to query |
| **Added** `TimeSeriesDataPoint` interface (line ~378) | Fields: `timestamp` (ISO string), `count` (number), `avgResolutionMinutes?`, `medianResolutionMinutes?`, `byStatus?` |
| **Added** `TimeSeriesResult` interface (line ~403) | Fields: `interval`, `metric`, `from`, `to`, `data: TimeSeriesDataPoint[]` |

**Why**: The charting endpoint needs typed request/response contracts shared between the store layer and route layer.

### 2. `src/server/tasks/store.ts`

| Change | Details |
|--------|---------|
| **Added** `getTaskTimeSeries()` to `TaskStore` interface (line ~108) | Signature: `(from, to, interval, metric) => Promise<TimeSeriesResult>` |
| **Added** `getTaskTimeSeries()` implementation (line ~2296) | Full SQLite query logic with bucket generation, gap-filling, and resolution time aggregation |

**Why**: The store queries SQLite with `strftime()` for time bucketing, generates empty buckets for gaps in the data, and computes avg/median for resolution time metric.

**Implementation details**:
- Uses `strftime()` with format strings adapted per interval (e.g., `%Y-%m-%d` for day, `%Y-%m-%dT%H:00:00` for hour)
- Generator function `generateBuckets()` creates all expected timestamps between `from` and `to` — ensures empty days/hours still appear in results (zero-fill)
- For `resolution_time` metric: groups `julianday(updated_at) - julianday(created_at)` in minutes per bucket, computes avg and median
- Max range enforced at route level (1 year)

### 3. `src/server/stats/routes.ts`

| Change | Details |
|--------|---------|
| **Added** `TimeSeriesInterval`, `TimeSeriesMetric` imports (line 3) | Type imports for query param validation |
| **Added** `GET /api/stats/timeseries` route (line ~37) | Full route with auth, query param parsing, validation, and store delegation |
| **Added** Query param validation | Validates `interval` against allowlist (defaults to `"day"`), validates `metric` against allowlist (defaults to `"created"`) |
| **Added** Time range validation | Ensures `from < to`, caps range at 1 year |
| **Added** Default time range | Last 30 days if `from`/`to` not specified |

**Why**: Exposes the time-series data via the existing stats route module, reusing the same auth middleware (`dashboard.read` permission) as `/api/stats/summary`.

## Structural Summary

- **New types**: 2 type aliases, 2 interfaces (total ~30 lines)
- **New store method**: `getTaskTimeSeries()` (~140 lines including gap-fill generator)
- **New route**: `GET /api/stats/timeseries` (~65 lines)
- **No deletions**

## Risk Assessment

- **Low risk**: Additive-only change — no existing code modified, only new types, methods, and route added.
- **SQL injection**: Not possible — `strftime` format is hardcoded per interval, not user-supplied; `from`/`to` are bound as parameters.
- **Performance**: Time-range capped at 1 year max. Hourly granularity over 1 year = ~8760 buckets — manageable.
- **Zero-fill gaps**: The generator ensures chart libraries receive continuous data without missing points.

## Verification Steps

1. ✅ `npm run typecheck` — passes (exit 0)
2. ✅ `npm run build` — passes (exit 0)
3. ✅ `npm test` — all 246 tests pass (10 files)
4. Manual API test: `GET /api/stats/timeseries?interval=day&metric=created` returns `TimeSeriesResult` with daily buckets
5. Manual API test: `GET /api/stats/timeseries?interval=hour&metric=resolution_time&from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z` returns hourly buckets with avg/median
