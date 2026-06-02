# Changelog: Prometheus-compatible metrics endpoint (/metrics)

## Overview

| Date | Task | Files | Lines Added | Lines Removed |
|------|------|-------|-------------|---------------|
| 2026-06-02 | Prometheus metrics endpoint | 5 | ~250 | ~2 |

## Changes by File

### 1. `src/server/metrics/collector.ts` (NEW)

**Purpose**: In-memory metrics collector that tracks HTTP requests, task operations, SSE connections, and server uptime. Exposes data in Prometheus exposition format.

**Key additions**:
- `recordHttpRequest()` — records HTTP request by method, path, status code, and duration
- `recordTaskCreated()` — counts task creation events
- `recordTaskCompleted()` — counts task completions by status (done/failed)
- `recordTaskStatusChange()` — counts status transitions (e.g., pending→running)
- `recordEventProcessed()` — counts Feishu events processed
- `recordRateLimitRejection()` — counts rate-limited requests
- `recordFeishuReply()` — counts Feishu reply attempts (success/failure)
- `recordSlaEvent()` — counts SLA warnings/breaches
- `recordWebhookDelivery()` — counts webhook delivery attempts
- `recordApiKeyOp()` — counts API key operations
- `formatMetrics()` — generates Prometheus exposition text with HELP/TYPE headers
- `normalizePath()` — normalizes URL paths for metric labels (strips IDs)

**Metrics exposed**:
- `harness_remote_server_uptime_seconds` (gauge)
- `harness_remote_sse_connections` (gauge)
- `harness_remote_tasks_total{status=...}` (gauge, by status)
- `harness_remote_tasks_count_total` (gauge, total)
- `harness_remote_tasks_created_total` (counter)
- `harness_remote_tasks_completed_total{status=...}` (counter)
- `harness_remote_task_status_changes_total{from=...,to=...}` (counter)
- `harness_remote_events_processed_total` (counter)
- `harness_remote_http_requests_total{method=...,path=...,status=...}` (counter)
- `harness_remote_http_request_duration_seconds_bucket{method=...,path=...,le=...}` (histogram)
- `harness_remote_rate_limit_rejected_total` (counter)
- `harness_remote_feishu_replies_total{result=...}` (counter)
- `harness_remote_sla_events_total{type=...}` (counter)
- `harness_remote_webhook_deliveries_total{result=...}` (counter)
- `harness_remote_api_key_ops_total{operation=...}` (counter)

### 2. `src/server/metrics/routes.ts` (NEW)

**Purpose**: Registers the `GET /metrics` endpoint. No authentication required (Prometheus scrapers typically don't send auth). Queries task store for current counts and formats as Prometheus text.

### 3. `src/server/index.ts` (MODIFIED)

**Changes**:
- Added import for `registerMetricsRoutes` and `recordHttpRequest`
- Added `recordHttpRequest()` call in the `onResponse` hook (skips `/metrics` itself)
- Added `registerMetricsRoutes(server, store)` call after SSE routes

### 4. `src/server/tasks/routes.ts` (MODIFIED)

**Changes**:
- Added import for `recordTaskStatusChange` and `recordTaskCompleted`
- Added `recordTaskStatusChange(previousStatus, status)` after successful status update
- Added `recordTaskCompleted(success ? "done" : "failed")` after result report

### 5. `src/server/feishu/events.ts` (MODIFIED)

**Changes**:
- Added import for `recordTaskCreated` and `recordEventProcessed`
- Added `recordTaskCreated()` after task creation from Feishu event

### 6. `src/server/ratelimit/middleware.ts` (MODIFIED)

**Changes**:
- Added import for `recordRateLimitRejection`
- Added `recordRateLimitRejection()` when rate limit is exceeded

### 7. `FEATURES.md` (MODIFIED)

**Changes**:
- Marked `Prometheus-compatible metrics endpoint (/metrics)` as completed

## Risk Assessment

**Risk level**: Low

- New `/metrics` endpoint has no authentication (intentional for Prometheus scrapers)
- Metrics are in-memory only — reset on server restart (acceptable for operational metrics)
- No external dependencies added
- Existing test suite passes (223/223)

## Verification

- `npm run typecheck` — PASS (exit 0)
- `npm run build` — PASS (exit 0)
- `npm run test` — PASS (223/223 tests)
- Manual: `GET /metrics` returns Prometheus-formatted text with all metric families
