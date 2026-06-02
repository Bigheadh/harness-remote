import { createHmac } from "node:crypto";
import type {
  WebhookSubscription,
  WebhookEvent,
  WebhookPayload,
  Task,
} from "../../shared/types.js";
import type { WebhookStore } from "./store.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

/** Maximum delivery attempts per webhook per event */
const MAX_RETRIES = 3;
/** Delay between retries in ms */
const RETRY_DELAY_MS = 2000;
/** HTTP request timeout in ms */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Sign a webhook payload with HMAC-SHA256.
 * Returns the hex-encoded signature for the X-Hub-Signature-256 header.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
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
    deliverToWebhook(store, sub, event, body).catch((err) => {
      log.error(
        { webhookId: sub.id, url: sub.url, event, err },
        "Unhandled webhook delivery error",
      );
    });
  }
}

/**
 * Deliver a webhook payload to a single subscription with retry logic.
 */
async function deliverToWebhook(
  store: WebhookStore,
  sub: WebhookSubscription,
  event: WebhookEvent,
  body: string,
): Promise<void> {
  const signature = signPayload(body, sub.secret);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
        });
        log.info(
          { webhookId: sub.id, event, statusCode: response.status, durationMs },
          "Webhook delivered successfully",
        );
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
        });
        log.warn(
          { webhookId: sub.id, event, statusCode: response.status },
          "Webhook delivery failed (non-retryable)",
        );
        return;
      }

      // Server error or 429 — retry
      if (attempt < MAX_RETRIES) {
        log.warn(
          { webhookId: sub.id, event, statusCode: response.status, attempt },
          "Webhook delivery failed, retrying",
        );
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      // Final attempt failed
      const errorText = await response.text().catch(() => "unknown");
      await store.logDelivery({
        webhookId: sub.id,
        event,
        url: sub.url,
        statusCode: response.status,
        success: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 500)} (after ${MAX_RETRIES} attempts)`,
        durationMs,
      });
      log.error(
        { webhookId: sub.id, event, statusCode: response.status, attempts: MAX_RETRIES },
        "Webhook delivery failed after all retries",
      );
      return;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (attempt < MAX_RETRIES) {
        log.warn(
          { webhookId: sub.id, event, error: errorMsg, attempt },
          "Webhook delivery error, retrying",
        );
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      await store.logDelivery({
        webhookId: sub.id,
        event,
        url: sub.url,
        statusCode: null,
        success: false,
        error: `${errorMsg} (after ${MAX_RETRIES} attempts)`,
        durationMs,
      });
      log.error(
        { webhookId: sub.id, event, error: errorMsg, attempts: MAX_RETRIES },
        "Webhook delivery failed after all retries",
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
