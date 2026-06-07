import { createHmac } from "node:crypto";
import type {
  WebhookSubscription,
  WebhookEvent,
  WebhookPayload,
  Task,
  PendingRetry,
} from "../../shared/types.js";
import type { WebhookStore } from "./store.js";
import { createLogger } from "../../shared/logger.js";
import { recordWebhookDelivery } from "../metrics/collector.js";

const log = createLogger({ level: "info" });

/** Maximum delivery attempts per webhook per event (including initial) */
const MAX_RETRIES = 5;
/** Base delay in ms for exponential backoff (1s, 2s, 4s, 8s, 16s) */
const BASE_DELAY_MS = 1_000;
/** Maximum delay cap in ms (30 seconds) */
const MAX_DELAY_MS = 30_000;
/** HTTP request timeout in ms */
const REQUEST_TIMEOUT_MS = 10_000;
/** How often the retry worker checks for due retries (in ms) */
const RETRY_WORKER_INTERVAL_MS = 10_000;

/**
 * Sign a webhook payload with HMAC-SHA256.
 * Returns the hex-encoded signature for the X-Hub-Signature-256 header.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Calculate exponential backoff delay with jitter.
 * attempt=1 → ~1s, attempt=2 → ~2s, attempt=3 → ~4s, etc.
 * Jitter adds ±25% randomness to prevent thundering herd.
 */
export function calculateBackoffDelay(attempt: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  // Add ±25% jitter
  const jitter = capped * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

/**
 * Dispatch a webhook event to all matching subscriptions.
 * This is fire-and-forget — delivery is async and logged to the delivery table.
 */
export async function dispatchWebhook(
  store: WebhookStore,
  event: WebhookEvent,
  task: Task,
  meta?: Record<string, unknown>,
): Promise<void> {
  const subscriptions = await store.getSubscriptionsForEvent(event);
  if (subscriptions.length === 0) return;

  const payload: WebhookPayload = {
    event,
    taskId: task.id,
    task,
    timestamp: new Date().toISOString(),
    meta,
  };

  const body = JSON.stringify(payload);

  // Fire all deliveries in parallel (non-blocking)
  for (const sub of subscriptions) {
    deliverToWebhook(store, sub, event, body, 1).catch((err) => {
      log.error(
        { webhookId: sub.id, url: sub.url, event, err },
        "Unhandled webhook delivery error",
      );
    });
  }
}

/**
 * Deliver a webhook payload to a single subscription with exponential backoff.
 * On failure, enqueues a pending retry to the database so it survives server restarts.
 */
async function deliverToWebhook(
  store: WebhookStore,
  sub: WebhookSubscription,
  event: WebhookEvent,
  body: string,
  attempt: number,
): Promise<void> {
  const signature = signPayload(body, sub.secret);

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${signature}`,
        "X-Webhook-Event": event,
        "User-Agent": "harness-remote-webhook/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;

    if (response.ok) {
      await store.logDelivery({
        webhookId: sub.id,
        event,
        url: sub.url,
        statusCode: response.status,
        success: true,
        durationMs,
        retryCount: attempt,
      });
      log.info(
        { webhookId: sub.id, event, statusCode: response.status, durationMs, attempt },
        "Webhook delivered successfully",
      );
      recordWebhookDelivery(true);
      return;
    }

    // Non-retryable client errors (4xx except 429)
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      const errorText = await response.text().catch(() => "unknown");
      await store.logDelivery({
        webhookId: sub.id,
        event,
        url: sub.url,
        statusCode: response.status,
        success: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 500)}`,
        durationMs,
        retryCount: attempt,
      });
      log.warn(
        { webhookId: sub.id, event, statusCode: response.status },
        "Webhook delivery failed (non-retryable)",
      );
      recordWebhookDelivery(false);
      return;
    }

    // Server error or 429 — enqueue retry
    await enqueueRetryOrGiveUp(store, sub, event, body, attempt, `HTTP ${response.status}`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    await enqueueRetryOrGiveUp(store, sub, event, body, attempt, errorMsg);
  }
}

/**
 * Either enqueue a pending retry or log the final failure.
 */
async function enqueueRetryOrGiveUp(
  store: WebhookStore,
  sub: WebhookSubscription,
  event: WebhookEvent,
  body: string,
  attempt: number,
  lastError: string,
): Promise<void> {
  if (attempt < MAX_RETRIES) {
    const delay = calculateBackoffDelay(attempt + 1);
    const nextRetryAt = new Date(Date.now() + delay).toISOString();
    const signature = signPayload(body, sub.secret);

    await store.enqueuePendingRetry({
      webhookId: sub.id,
      event,
      url: sub.url,
      body,
      signature,
      attempt: attempt + 1,
      maxAttempts: MAX_RETRIES,
      nextRetryAt,
      lastError,
    });

    log.warn(
      { webhookId: sub.id, event, attempt, nextRetryAt, delay, lastError },
      "Webhook delivery failed, enqueued retry",
    );
  } else {
    await store.logDelivery({
      webhookId: sub.id,
      event,
      url: sub.url,
      statusCode: null,
      success: false,
      error: `${lastError} (after ${MAX_RETRIES} attempts)`,
      durationMs: 0,
      retryCount: attempt,
    });
    log.error(
      { webhookId: sub.id, event, attempts: MAX_RETRIES, lastError },
      "Webhook delivery failed after all retries",
    );
  }
}

/**
 * Retry worker — periodically checks for due pending retries and executes them.
 * Returns a cleanup function to stop the interval.
 */
export function startRetryWorker(store: WebhookStore): () => void {
  const interval = setInterval(async () => {
    try {
      const pending = await store.getDuePendingRetries(10);
      if (pending.length === 0) return;

      log.info({ count: pending.length }, "Processing pending webhook retries");

      for (const retry of pending) {
        // Remove from queue before attempting (to avoid duplicate processing)
        await store.removePendingRetry(retry.id);

        try {
          await executeRetry(store, retry);
        } catch (err) {
          log.error(
            { pendingRetryId: retry.id, webhookId: retry.webhookId, err },
            "Error processing pending retry",
          );
        }
      }
    } catch (err) {
      log.error({ err }, "Retry worker error");
    }
  }, RETRY_WORKER_INTERVAL_MS);

  log.info({ intervalMs: RETRY_WORKER_INTERVAL_MS }, "Webhook retry worker started");

  return () => {
    clearInterval(interval);
    log.info({}, "Webhook retry worker stopped");
  };
}

/**
 * Execute a single pending retry.
 */
async function executeRetry(store: WebhookStore, retry: PendingRetry): Promise<void> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(retry.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${retry.signature}`,
        "X-Webhook-Event": retry.event,
        "User-Agent": "harness-remote-webhook/1.0",
      },
      body: retry.body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;

    if (response.ok) {
      await store.logDelivery({
        webhookId: retry.webhookId,
        event: retry.event,
        url: retry.url,
        statusCode: response.status,
        success: true,
        durationMs,
        retryCount: retry.attempt,
      });
      log.info(
        { webhookId: retry.webhookId, event: retry.event, statusCode: response.status, attempt: retry.attempt },
        "Pending retry delivered successfully",
      );
      return;
    }

    // Non-retryable
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      const errorText = await response.text().catch(() => "unknown");
      await store.logDelivery({
        webhookId: retry.webhookId,
        event: retry.event,
        url: retry.url,
        statusCode: response.status,
        success: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 500)}`,
        durationMs,
        retryCount: retry.attempt,
      });
      log.warn(
        { webhookId: retry.webhookId, event: retry.event, statusCode: response.status },
        "Pending retry failed (non-retryable)",
      );
      return;
    }

    // Retryable error — enqueue next attempt if available
    await enqueuePendingRetryOrGiveUp(store, retry, `HTTP ${response.status}`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    await enqueuePendingRetryOrGiveUp(store, retry, errorMsg);
  }
}

/**
 * Enqueue the next pending retry attempt, or log final failure.
 */
async function enqueuePendingRetryOrGiveUp(
  store: WebhookStore,
  retry: PendingRetry,
  lastError: string,
): Promise<void> {
  if (retry.attempt < retry.maxAttempts) {
    const delay = calculateBackoffDelay(retry.attempt + 1);
    const nextRetryAt = new Date(Date.now() + delay).toISOString();

    await store.enqueuePendingRetry({
      webhookId: retry.webhookId,
      event: retry.event,
      url: retry.url,
      body: retry.body,
      signature: retry.signature,
      attempt: retry.attempt + 1,
      maxAttempts: retry.maxAttempts,
      nextRetryAt,
      lastError,
    });

    log.warn(
      { webhookId: retry.webhookId, event: retry.event, attempt: retry.attempt + 1, lastError },
      "Pending retry failed, re-enqueued with exponential backoff",
    );
  } else {
    await store.logDelivery({
      webhookId: retry.webhookId,
      event: retry.event,
      url: retry.url,
      statusCode: null,
      success: false,
      error: `${lastError} (after ${retry.maxAttempts} attempts)`,
      durationMs: 0,
      retryCount: retry.attempt,
    });
    log.error(
      { webhookId: retry.webhookId, event: retry.event, attempts: retry.maxAttempts, lastError },
      "Pending retry exhausted all attempts",
    );
  }
}
