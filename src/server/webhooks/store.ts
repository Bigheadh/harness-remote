import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type {
  WebhookSubscription,
  WebhookEvent,
  WebhookDelivery,
  PendingRetry,
} from "../../shared/types.js";

export interface WebhookStore {
  createSubscription(sub: Omit<WebhookSubscription, "id" | "secret" | "createdAt" | "updatedAt">): Promise<WebhookSubscription>;
  listSubscriptions(): Promise<WebhookSubscription[]>;
  getSubscription(id: string): Promise<WebhookSubscription | undefined>;
  updateSubscription(id: string, updates: Partial<Pick<WebhookSubscription, "url" | "events" | "enabled" | "description">>): Promise<WebhookSubscription>;
  deleteSubscription(id: string): Promise<boolean>;
  rotateSecret(id: string): Promise<WebhookSubscription>;
  getSubscriptionsForEvent(event: WebhookEvent): Promise<WebhookSubscription[]>;
  logDelivery(delivery: Omit<WebhookDelivery, "id" | "timestamp">): Promise<void>;
  getDeliveries(webhookId?: string, limit?: number): Promise<WebhookDelivery[]>;
  // Pending retry queue (for exponential backoff across restarts)
  enqueuePendingRetry(retry: Omit<PendingRetry, "id" | "createdAt">): Promise<void>;
  getDuePendingRetries(limit?: number): Promise<PendingRetry[]>;
  removePendingRetry(id: number): Promise<void>;
  getPendingRetryCount(): Promise<number>;
}

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export function createWebhookStore(storagePath: string): WebhookStore {
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new DatabaseSync(storagePath);
  db.exec(`PRAGMA journal_mode=WAL;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      secret TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id TEXT NOT NULL,
      event TEXT NOT NULL,
      url TEXT NOT NULL,
      status_code INTEGER,
      success INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 1,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (webhook_id) REFERENCES webhook_subscriptions(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id
      ON webhook_deliveries(webhook_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_timestamp
      ON webhook_deliveries(timestamp)
  `);

  // Pending retries table for exponential backoff retry queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_pending_retries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id TEXT NOT NULL,
      event TEXT NOT NULL,
      url TEXT NOT NULL,
      body TEXT NOT NULL,
      signature TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_retry_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_error TEXT,
      FOREIGN KEY (webhook_id) REFERENCES webhook_subscriptions(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pending_retries_next_retry
      ON webhook_pending_retries(next_retry_at)
  `);

  const insertSub = db.prepare(`
    INSERT INTO webhook_subscriptions (id, url, events, secret, enabled, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectSubById = db.prepare(`SELECT * FROM webhook_subscriptions WHERE id = ?`);
  const selectAllSubs = db.prepare(`SELECT * FROM webhook_subscriptions ORDER BY created_at DESC`);
  const deleteSubStmt = db.prepare(`DELETE FROM webhook_subscriptions WHERE id = ?`);
  const updateSubStmt = db.prepare(`
    UPDATE webhook_subscriptions SET url = ?, events = ?, enabled = ?, description = ?, updated_at = ? WHERE id = ?
  `);
  const rotateSecretStmt = db.prepare(`
    UPDATE webhook_subscriptions SET secret = ?, updated_at = ? WHERE id = ?
  `);

  const selectSubsByEvent = db.prepare(`
    SELECT * FROM webhook_subscriptions WHERE enabled = 1 AND events LIKE ?
  `);

  const insertDelivery = db.prepare(`
    INSERT INTO webhook_deliveries (webhook_id, event, url, status_code, success, error, duration_ms, retry_count, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectDeliveries = db.prepare(`
    SELECT * FROM webhook_deliveries
    WHERE webhook_id = COALESCE(?, webhook_id)
    ORDER BY id DESC
    LIMIT ?
  `);

  // Pending retry statements
  const insertPendingRetry = db.prepare(`
    INSERT INTO webhook_pending_retries (webhook_id, event, url, body, signature, attempt, max_attempts, next_retry_at, created_at, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectPendingRetriesDue = db.prepare(`
    SELECT * FROM webhook_pending_retries WHERE next_retry_at <= ? ORDER BY next_retry_at ASC LIMIT ?
  `);
  const deletePendingRetry = db.prepare(`DELETE FROM webhook_pending_retries WHERE id = ?`);
  const countPendingRetries = db.prepare(`SELECT COUNT(*) as cnt FROM webhook_pending_retries`);

  function rowToSub(row: Record<string, unknown>): WebhookSubscription {
    const eventsRaw = row["events"] as string;
    const events: WebhookEvent[] = eventsRaw ? JSON.parse(eventsRaw) : [];
    return {
      id: row["id"] as string,
      url: row["url"] as string,
      events,
      secret: row["secret"] as string,
      enabled: Boolean(row["enabled"]),
      description: (row["description"] as string) ?? undefined,
      createdAt: row["created_at"] as string,
      updatedAt: row["updated_at"] as string,
    };
  }

  function rowToDelivery(row: Record<string, unknown>): WebhookDelivery {
    return {
      id: Number(row["id"]),
      webhookId: row["webhook_id"] as string,
      event: row["event"] as WebhookEvent,
      url: row["url"] as string,
      statusCode: row["status_code"] != null ? Number(row["status_code"]) : null,
      success: Boolean(row["success"]),
      error: (row["error"] as string) ?? undefined,
      durationMs: Number(row["duration_ms"]),
      timestamp: row["timestamp"] as string,
      retryCount: row["retry_count"] != null ? Number(row["retry_count"]) : 1,
    };
  }

  function rowToPendingRetry(row: Record<string, unknown>): PendingRetry {
    return {
      id: Number(row["id"]),
      webhookId: row["webhook_id"] as string,
      event: row["event"] as WebhookEvent,
      url: row["url"] as string,
      body: row["body"] as string,
      signature: row["signature"] as string,
      attempt: Number(row["attempt"]),
      maxAttempts: Number(row["max_attempts"]),
      nextRetryAt: row["next_retry_at"] as string,
      createdAt: row["created_at"] as string,
      lastError: (row["last_error"] as string) ?? undefined,
    };
  }

  return {
    async createSubscription(sub) {
      const now = new Date().toISOString();
      const id = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const secret = generateSecret();
      const eventsJson = JSON.stringify(sub.events);

      insertSub.run(
        id,
        sub.url,
        eventsJson,
        secret,
        sub.enabled ? 1 : 0,
        sub.description ?? null,
        now,
        now,
      );

      const row = selectSubById.get(id) as Record<string, unknown>;
      return rowToSub(row);
    },

    async listSubscriptions() {
      const rows = selectAllSubs.all() as Array<Record<string, unknown>>;
      return rows.map(rowToSub);
    },

    async getSubscription(id) {
      const row = selectSubById.get(id) as Record<string, unknown> | undefined;
      return row ? rowToSub(row) : undefined;
    },

    async updateSubscription(id, updates) {
      const existing = selectSubById.get(id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error(`Webhook subscription not found: ${id}`);

      const now = new Date().toISOString();
      const url = updates.url ?? (existing["url"] as string);
      const events = updates.events ?? JSON.parse(existing["events"] as string);
      const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : Number(existing["enabled"]);
      const description: string | null = updates.description !== undefined
        ? (updates.description ?? null)
        : ((existing["description"] as string) ?? null);

      updateSubStmt.run(url, JSON.stringify(events), enabled, description, now, id);

      const row = selectSubById.get(id) as Record<string, unknown>;
      return rowToSub(row);
    },

    async deleteSubscription(id) {
      const result = deleteSubStmt.run(id);
      return Number(result.changes) > 0;
    },

    async rotateSecret(id) {
      const existing = selectSubById.get(id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error(`Webhook subscription not found: ${id}`);

      const now = new Date().toISOString();
      const newSecret = generateSecret();
      rotateSecretStmt.run(newSecret, now, id);

      const row = selectSubById.get(id) as Record<string, unknown>;
      return rowToSub(row);
    },

    async getSubscriptionsForEvent(event) {
      const pattern = `%"${event}"%`;
      const rows = selectSubsByEvent.all(pattern) as Array<Record<string, unknown>>;
      return rows
        .map(rowToSub)
        .filter((sub) => sub.events.includes(event));
    },

    async logDelivery(delivery) {
      const now = new Date().toISOString();
      insertDelivery.run(
        delivery.webhookId,
        delivery.event,
        delivery.url,
        delivery.statusCode ?? null,
        delivery.success ? 1 : 0,
        delivery.error ?? null,
        delivery.durationMs,
        delivery.retryCount ?? 1,
        now,
      );
    },

    async getDeliveries(webhookId, limit) {
      const effectiveLimit = Math.min(limit ?? 50, 200);
      const rows = selectDeliveries.all(webhookId ?? null, effectiveLimit) as Array<
        Record<string, unknown>
      >;
      return rows.map(rowToDelivery);
    },

    async enqueuePendingRetry(retry) {
      const now = new Date().toISOString();
      insertPendingRetry.run(
        retry.webhookId,
        retry.event,
        retry.url,
        retry.body,
        retry.signature,
        retry.attempt,
        retry.maxAttempts,
        retry.nextRetryAt,
        now,
        retry.lastError ?? null,
      );
    },

    async getDuePendingRetries(limit) {
      const now = new Date().toISOString();
      const effectiveLimit = limit ?? 10;
      const rows = selectPendingRetriesDue.all(now, effectiveLimit) as Array<Record<string, unknown>>;
      return rows.map(rowToPendingRetry);
    },

    async removePendingRetry(id) {
      deletePendingRetry.run(id);
    },

    async getPendingRetryCount() {
      const row = countPendingRetries.get() as Record<string, unknown>;
      return Number(row["cnt"]);
    },
  };
}
