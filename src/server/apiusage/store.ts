/**
 * SQLite-backed API usage analytics store.
 *
 * Records every API request (caller, method, path, status, duration) into a
 * SQLite table for later aggregation. Designed for the "per user/device"
 * analytics view: who's calling what, how fast, and how often.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ApiUsageEntry,
  ApiUsageCallerStats,
  ApiUsageStats,
} from "../../shared/types.js";

export interface ApiUsageStore {
  /** Record a single API request */
  recordRequest(
    callerId: string,
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): void;

  /**
   * Get aggregated usage stats for all callers.
   * @param from ISO 8601 start time (optional filter)
   * @param to ISO 8601 end time (optional filter)
   */
  getStats(from?: string, to?: string): ApiUsageStats;

  /** Get raw entries for a specific caller (for debugging) */
  getEntriesForCaller(callerId: string, limit?: number): ApiUsageEntry[];

  /** Get the count of tracked requests */
  getCount(): number;
}

export function createApiUsageStore(storagePath: string): ApiUsageStore {
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new DatabaseSync(storagePath);

  // Enable WAL mode for better read concurrency
  db.exec("PRAGMA journal_mode = WAL");

  // Create the usage tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Index for time-range queries and per-caller queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_usage_caller ON api_usage(caller_id)`);

  function recordRequest(
    callerId: string,
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const stmt = db.prepare(
      `INSERT INTO api_usage (caller_id, method, path, status_code, duration_ms, timestamp)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    );
    stmt.run(callerId, method, path, statusCode, durationMs);
  }

  function getEntriesForCaller(callerId: string, limit = 50): ApiUsageEntry[] {
    const stmt = db.prepare(
      `SELECT id, caller_id AS callerId, method, path, status_code AS statusCode,
              duration_ms AS durationMs, timestamp
       FROM api_usage
       WHERE caller_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    );
    const rows = stmt.all(callerId, limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row["id"] as number,
      callerId: row["callerId"] as string,
      method: row["method"] as string,
      path: row["path"] as string,
      statusCode: row["statusCode"] as number,
      durationMs: row["durationMs"] as number,
      timestamp: row["timestamp"] as string,
    }));
  }

  function getCount(): number {
    const stmt = db.prepare(`SELECT COUNT(*) AS cnt FROM api_usage`);
    const row = stmt.get() as Record<string, unknown>;
    return (row["cnt"] as number) ?? 0;
  }

  function getStats(from?: string, to?: string): ApiUsageStats {
    // Build WHERE clause for time filtering
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (from) {
      conditions.push("timestamp >= ?");
      params.push(from);
    }
    if (to) {
      conditions.push("timestamp <= ?");
      params.push(to);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countStmt = db.prepare(
      `SELECT COUNT(*) AS cnt FROM api_usage ${whereClause}`,
    );
    const countRow = countStmt.get(...params) as Record<string, unknown>;
    const totalRequests = (countRow["cnt"] as number) ?? 0;

    // Get time range
    let fromTime = from ?? new Date(0).toISOString();
    let toTime = to ?? new Date().toISOString();
    if (totalRequests > 0) {
      const rangeStmt = db.prepare(
        `SELECT MIN(timestamp) AS minTs, MAX(timestamp) AS maxTs FROM api_usage ${whereClause}`,
      );
      const rangeRow = rangeStmt.get(...params) as Record<string, unknown>;
      fromTime = (rangeRow["minTs"] as string) ?? fromTime;
      toTime = (rangeRow["maxTs"] as string) ?? toTime;
    }

    // Get per-caller aggregation
    const callerStmt = db.prepare(
      `SELECT caller_id AS callerId,
              COUNT(*) AS totalRequests,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errorRequests,
              AVG(duration_ms) AS avgDurationMs,
              MAX(timestamp) AS lastRequestAt
       FROM api_usage
       ${whereClause}
       GROUP BY caller_id
       ORDER BY totalRequests DESC`,
    );
    const callerRows = callerStmt.all(...params) as Record<string, unknown>[];

    const callers: ApiUsageCallerStats[] = callerRows.map((row) => {
      const callerId = row["callerId"] as string;
      const total = (row["totalRequests"] as number) ?? 0;
      const errors = (row["errorRequests"] as number) ?? 0;
      const avgDuration = (row["avgDurationMs"] as number) ?? 0;

      // Get detailed stats for this caller
      const callerConditions = ["caller_id = ?"];
      const callerParams: (string | number)[] = [callerId];
      if (from) {
        callerConditions.push("timestamp >= ?");
        callerParams.push(from);
      }
      if (to) {
        callerConditions.push("timestamp <= ?");
        callerParams.push(to);
      }
      const callerWhere = callerConditions.join(" AND ");

      // Get all durations for percentile calculation
      const durStmt = db.prepare(
        `SELECT duration_ms AS d FROM api_usage WHERE ${callerWhere} ORDER BY duration_ms`,
      );
      const durRows = durStmt.all(...callerParams) as Record<string, unknown>[];
      const durations = durRows.map((r) => (r["d"] as number) ?? 0);
      const medianDuration = durations.length > 0
        ? durations[Math.floor(durations.length / 2)]
        : 0;
      const p95Index = Math.floor(durations.length * 0.95);
      const p95Duration = durations.length > 0 ? durations[Math.min(p95Index, durations.length - 1)] : 0;

      // Status breakdown
      const statusStmt = db.prepare(
        `SELECT status_code AS sc, COUNT(*) AS cnt FROM api_usage WHERE ${callerWhere} GROUP BY status_code`,
      );
      const statusRows = statusStmt.all(...callerParams) as Record<string, unknown>[];
      const byStatus: Record<number, number> = {};
      for (const sr of statusRows) {
        byStatus[sr["sc"] as number] = (sr["cnt"] as number) ?? 0;
      }

      // Method breakdown
      const methodStmt = db.prepare(
        `SELECT method, COUNT(*) AS cnt FROM api_usage WHERE ${callerWhere} GROUP BY method`,
      );
      const methodRows = methodStmt.all(...callerParams) as Record<string, unknown>[];
      const byMethod: Record<string, number> = {};
      for (const mr of methodRows) {
        byMethod[mr["method"] as string] = (mr["cnt"] as number) ?? 0;
      }

      // Path breakdown (top 10)
      const pathStmt = db.prepare(
        `SELECT path, COUNT(*) AS cnt, AVG(duration_ms) AS avgDur
         FROM api_usage WHERE ${callerWhere}
         GROUP BY path ORDER BY cnt DESC LIMIT 10`,
      );
      const pathRows = pathStmt.all(...callerParams) as Record<string, unknown>[];
      const byPath = pathRows.map((pr) => ({
        path: pr["path"] as string,
        count: (pr["cnt"] as number) ?? 0,
        avgDurationMs: Math.round((pr["avgDur"] as number) ?? 0),
      }));

      return {
        callerId,
        totalRequests: total,
        errorRequests: errors,
        errorRate: total > 0 ? Math.round((errors / total) * 10000) / 100 : 0,
        avgDurationMs: Math.round(avgDuration),
        medianDurationMs: medianDuration,
        p95DurationMs: p95Duration,
        byStatus,
        byMethod,
        byPath,
        lastRequestAt: (row["lastRequestAt"] as string) ?? "",
      };
    });

    // Slowest endpoints (top 10)
    const slowStmt = db.prepare(
      `SELECT method, path, AVG(duration_ms) AS avgDur, COUNT(*) AS cnt
       FROM api_usage ${whereClause}
       GROUP BY method, path
       ORDER BY avgDur DESC
       LIMIT 10`,
    );
    const slowRows = slowStmt.all(...params) as Record<string, unknown>[];
    const slowestEndpoints = slowRows.map((sr) => ({
      method: sr["method"] as string,
      path: sr["path"] as string,
      avgDurationMs: Math.round((sr["avgDur"] as number) ?? 0),
      count: (sr["cnt"] as number) ?? 0,
    }));

    return {
      totalRequests,
      from: fromTime,
      to: toTime,
      callers,
      slowestEndpoints,
    };
  }

  return { recordRequest, getStats, getEntriesForCaller, getCount };
}
