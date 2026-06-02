import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditLogEntry, AuditLogSearchOptions } from "../../shared/types.js";

export interface AuditLogStore {
  log(entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<void>;
  query(options: AuditLogSearchOptions): Promise<AuditLogEntry[]>;
  count(): Promise<number>;
  cleanup(retentionDays?: number): Promise<number>;
}

export function createAuditLogStore(storagePath: string): AuditLogStore {
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new DatabaseSync(storagePath);
  db.exec(`PRAGMA journal_mode=WAL;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      task_id TEXT,
      actor TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_task_id ON audit_log(task_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor_type ON audit_log(actor_type)
  `);

  const insertStmt = db.prepare(`
    INSERT INTO audit_log (action, task_id, actor, actor_type, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return {
    async log(entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<void> {
      const now = new Date().toISOString();
      const detailsJson = entry.details ? JSON.stringify(entry.details) : null;
      insertStmt.run(
        entry.action,
        entry.taskId ?? null,
        entry.actor,
        entry.actorType,
        detailsJson,
        now,
      );
    },

    async query(options: AuditLogSearchOptions): Promise<AuditLogEntry[]> {
      const conditions: string[] = [];
      const params: (string | number | null)[] = [];

      if (options.action) {
        conditions.push("action = ?");
        params.push(options.action);
      }
      if (options.taskId) {
        conditions.push("task_id = ?");
        params.push(options.taskId);
      }
      if (options.actor) {
        conditions.push("actor = ?");
        params.push(options.actor);
      }
      if (options.actorType) {
        conditions.push("actor_type = ?");
        params.push(options.actorType);
      }
      if (options.from) {
        conditions.push("timestamp >= ?");
        params.push(options.from);
      }
      if (options.to) {
        conditions.push("timestamp <= ?");
        params.push(options.to);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const effectiveLimit = Math.min(options.limit ?? 50, 200);

      const sql = `
        SELECT * FROM audit_log ${where}
        ORDER BY id DESC
        LIMIT ?
      `;

      const rows = db.prepare(sql).all(...params, effectiveLimit) as Array<
        Record<string, unknown>
      >;

      return rows.map((row) => ({
        id: Number(row["id"]),
        action: row["action"] as string,
        taskId: (row["task_id"] as string) ?? undefined,
        actor: row["actor"] as string,
        actorType: row["actor_type"] as AuditLogEntry["actorType"],
        details: row["details"]
          ? (JSON.parse(row["details"] as string) as Record<string, unknown>)
          : undefined,
        timestamp: row["timestamp"] as string,
      }));
    },

    async count(): Promise<number> {
      const row = db.prepare("SELECT COUNT(*) as cnt FROM audit_log").get() as Record<string, unknown>;
      return Number(row["cnt"]);
    },

    async cleanup(retentionDays: number = 30): Promise<number> {
      const cutoff = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const result = db
        .prepare("DELETE FROM audit_log WHERE timestamp < ?")
        .run(cutoff);
      return Number(result.changes);
    },
  };
}
