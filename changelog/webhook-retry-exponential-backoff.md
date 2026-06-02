# Webhook Delivery Retry with Exponential Backoff

**Date**: 2026-06-03
**Feature**: Phase 23 — Webhook delivery retry with exponential backoff
**Files Modified**: 4
**Lines Added**: ~200
**Lines Removed**: ~50

## Overview

Replaced the linear retry backoff (2s, 4s, 6s) with exponential backoff with jitter and a persistent retry queue that survives server restarts. Failed deliveries are now enqueued to a SQLite table (`webhook_pending_retries`) and processed by a background retry worker.

## Changes

### `src/shared/types.ts`
- **Added `retryCount` field** to `WebhookDelivery` interface — tracks how many attempts were made
- **Added `PendingRetry` interface** — represents a queued retry entry with: webhookId, event, url, body, signature, attempt, maxAttempts, nextRetryAt, createdAt, lastError

### `src/server/webhooks/store.ts`
- **Added `pending_retries` table** — SQLite table with indexes on `next_retry_at` for efficient polling
- **Added `retry_count` column** to `webhook_deliveries` table — default 1
- **Added prepared statements**: `insertPendingRetry`, `selectPendingRetriesDue`, `deletePendingRetry`, `countPendingRetries`
- **Added `rowToPendingRetry` helper** — converts DB row to `PendingRetry` type
- **Updated `logDelivery`** — now accepts and stores `retryCount`
- **Added store methods**: `enqueuePendingRetry`, `getDuePendingRetries`, `removePendingRetry`, `getPendingRetryCount`

### `src/server/webhooks/dispatcher.ts`
- **Replaced linear backoff** (`RETRY_DELAY_MS * attempt`) with exponential backoff + jitter:
  - `calculateBackoffDelay(attempt)`: 1s, 2s, 4s, 8s, 16s (capped at 30s) with ±25% jitter
- **Added persistent retry queue**: on failure, deliveries are enqueued to `webhook_pending_retries` with calculated `nextRetryAt` timestamp
- **Added `startRetryWorker()`**: polls every 10s for due retries, removes from queue, and re-attempts delivery
- **Added `executeRetry()`**: processes a single pending retry (fetch → success/fail → re-enqueue or log)
- **Added `enqueuePendingRetryOrGiveUp()`**: decides whether to re-enqueue or log final failure
- **Increased `MAX_RETRIES`** from 3 to 5 (backoff sequence: 1s, 2s, 4s, 8s, 16s)

### `src/server/index.ts`
- **Imported `startRetryWorker`** from dispatcher
- **Started retry worker** on server boot (10s interval)
- **Added `stopRetryWorker()`** to graceful shutdown handler

### `FEATURES.md`
- Marked "Webhook delivery retry with exponential backoff" as `[x]`

## Backoff Schedule

| Attempt | Base Delay | With Jitter (±25%) |
|---------|-----------|-------------------|
| 1       | 1s        | 0.75s – 1.25s    |
| 2       | 2s        | 1.5s – 2.5s      |
| 3       | 4s        | 3s – 5s          |
| 4       | 8s        | 6s – 10s         |
| 5       | 16s       | 12s – 20s        |

## Why Exponential Backoff + Persistent Queue

- **Exponential backoff** prevents hammering a struggling endpoint while still retrying quickly for transient issues
- **Jitter** prevents thundering herd when multiple webhooks fail simultaneously
- **Persistent queue** ensures retries survive server restarts — previously a restart mid-retry would lose all pending retries
- **Background worker** decouples retry processing from the original request path

## Risk

- **Low**: Existing behavior preserved (same HTTP delivery, same HMAC signing). New behavior is additive (persistent queue + retry worker).
- **Database migration**: `retry_count` column has `DEFAULT 1`, `pending_retries` table is `IF NOT EXISTS` — safe for existing databases.

## Verification

1. `npm run typecheck` — passes
2. `npm run build` — passes
3. Retry worker starts on server boot (visible in logs: "Webhook retry worker started")
4. Failed webhook deliveries are enqueued to `webhook_pending_retries` table
5. Retry worker processes due retries every 10 seconds
