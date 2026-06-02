import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { UserRole } from "../../../shared/types.js";

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  userId: string;
  role: UserRole;
  /** Previous key (still valid during grace period), null if no previous key */
  previousKey: string | null;
  /** ISO 8601 — when the previous key expires, null if no grace period active */
  previousKeyExpiresAt: string | null;
  enabled: boolean;
  /** ISO 8601 */
  lastUsedAt: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

function generateApiKey(): string {
  return `ak_${randomBytes(32).toString("hex")}`;
}

function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    key: row["key"] as string,
    userId: row["user_id"] as string,
    role: row["role"] as UserRole,
    previousKey: (row["previous_key"] as string) ?? null,
    previousKeyExpiresAt: (row["previous_key_expires_at"] as string) ?? null,
    enabled: (row["enabled"] as number) === 1,
    lastUsedAt: (row["last_used_at"] as string) ?? null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export interface ApiKeyStore {
  createApiKey(name: string, userId: string, role: UserRole): Promise<ApiKey>;
  getApiKeyById(id: string): Promise<ApiKey | undefined>;
  getApiKeyByKey(key: string): Promise<ApiKey | undefined>;
  listApiKeys(userId?: string): Promise<ApiKey[]>;
  rotateApiKey(id: string, gracePeriodMs: number): Promise<ApiKey>;
  revokeApiKey(id: string): Promise<boolean>;
  enableApiKey(id: string): Promise<ApiKey>;
  disableApiKey(id: string): Promise<ApiKey>;
  markLastUsed(id: string): Promise<void>;
  deleteExpiredPreviousKeys(): Promise<number>;
  countApiKeys(): Promise<number>;
}

export function createApiKeyStore(storagePath: string): ApiKeyStore {
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new DatabaseSync(storagePath);
  db.exec(`PRAGMA journal_mode=WAL;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'viewer')),
      previous_key TEXT,
      previous_key_expires_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`);

  // Unique constraint: only one active key per user (only one row with previous_key IS NULL and enabled=1)
  // We enforce this at the application level for clarity.

  const insertKey = db.prepare(`
    INSERT INTO api_keys (id, name, key, user_id, role, previous_key, previous_key_expires_at, enabled, last_used_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
  `);

  const selectById = db.prepare(`SELECT * FROM api_keys WHERE id = ?`);
  const selectByKey = db.prepare(`SELECT * FROM api_keys WHERE key = ?`);
  const selectByUserId = db.prepare(`SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`);
  const selectAll = db.prepare(`SELECT * FROM api_keys ORDER BY created_at DESC`);
  const countAll = db.prepare(`SELECT COUNT(*) as cnt FROM api_keys`);

  const updateEnabled = db.prepare(`UPDATE api_keys SET enabled = ?, updated_at = ? WHERE id = ?`);
  const updateRotate = db.prepare(`
    UPDATE api_keys
    SET key = ?, previous_key = ?, previous_key_expires_at = ?, updated_at = ?
    WHERE id = ?
  `);
  const updateLastUsed = db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`);
  const deleteById = db.prepare(`DELETE FROM api_keys WHERE id = ?`);
  const deleteExpiredPrevious = db.prepare(`
    DELETE FROM api_keys WHERE previous_key IS NOT NULL AND previous_key_expires_at < ?
  `);

  function generateId(): string {
    return `apikey_${Date.now()}_${randomBytes(4).toString("hex")}`;
  }

  return {
    async createApiKey(name: string, userId: string, role: UserRole): Promise<ApiKey> {
      const id = generateId();
      const key = generateApiKey();
      const now = new Date().toISOString();

      insertKey.run(id, name, key, userId, role, null, null, now, now);

      const row = selectById.get(id) as Record<string, unknown>;
      return rowToApiKey(row);
    },

    async getApiKeyById(id: string): Promise<ApiKey | undefined> {
      const row = selectById.get(id) as Record<string, unknown> | undefined;
      return row ? rowToApiKey(row) : undefined;
    },

    async getApiKeyByKey(key: string): Promise<ApiKey | undefined> {
      const row = selectByKey.get(key) as Record<string, unknown> | undefined;
      return row ? rowToApiKey(row) : undefined;
    },

    async listApiKeys(userId?: string): Promise<ApiKey[]> {
      const rows = userId
        ? (selectByUserId.all(userId) as Array<Record<string, unknown>>)
        : (selectAll.all() as Array<Record<string, unknown>>);
      return rows.map(rowToApiKey);
    },

    async rotateApiKey(id: string, gracePeriodMs: number): Promise<ApiKey> {
      const existing = await this.getApiKeyById(id);
      if (!existing) {
        throw new Error(`API key not found: ${id}`);
      }

      const newKey = generateApiKey();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + gracePeriodMs).toISOString();
      const nowIso = now.toISOString();

      // Move current key to previous_key, set new key as current
      updateRotate.run(newKey, existing.key, expiresAt, nowIso, id);

      const row = selectById.get(id) as Record<string, unknown>;
      return rowToApiKey(row);
    },

    async revokeApiKey(id: string): Promise<boolean> {
      const result = deleteById.run(id);
      return Number(result.changes) > 0;
    },

    async enableApiKey(id: string): Promise<ApiKey> {
      const now = new Date().toISOString();
      const result = updateEnabled.run(1, now, id);
      if (Number(result.changes) === 0) {
        throw new Error(`API key not found: ${id}`);
      }
      const row = selectById.get(id) as Record<string, unknown>;
      return rowToApiKey(row);
    },

    async disableApiKey(id: string): Promise<ApiKey> {
      const now = new Date().toISOString();
      const result = updateEnabled.run(0, now, id);
      if (Number(result.changes) === 0) {
        throw new Error(`API key not found: ${id}`);
      }
      const row = selectById.get(id) as Record<string, unknown>;
      return rowToApiKey(row);
    },

    async markLastUsed(id: string): Promise<void> {
      const now = new Date().toISOString();
      updateLastUsed.run(now, id);
    },

    async deleteExpiredPreviousKeys(): Promise<number> {
      const now = new Date().toISOString();
      const result = deleteExpiredPrevious.run(now);
      return Number(result.changes);
    },

    async countApiKeys(): Promise<number> {
      const row = countAll.get() as Record<string, unknown>;
      return Number(row["cnt"]);
    },
  };
}
