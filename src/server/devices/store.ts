import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Device } from "../../shared/types.js";
import { hashSecret, isHashedSecret } from "../auth/token-hash.js";

export interface DeviceStore {
  registerDevice(name: string, capabilities?: string): Promise<Device>;
  listDevices(): Promise<Device[]>;
  getDevice(id: string): Promise<Device | undefined>;
  getDeviceByToken(token: string): Promise<Device | undefined>;
  updateDeviceHeartbeat(id: string): Promise<void>;
  deleteDevice(id: string): Promise<boolean>;
  close?(): void;
}

function generateDeviceId(): string {
  return `dev_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

function generateDeviceToken(): string {
  return `dtoken_${randomBytes(24).toString("hex")}`;
}

function rowToDevice(row: Record<string, unknown>): Device {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    token: row["token"] as string,
    capabilities: (row["capabilities"] as string) ?? undefined,
    lastSeen: (row["last_seen"] as string) ?? undefined,
    createdAt: row["created_at"] as string,
  };
}

export function createDeviceStore(storagePath: string): DeviceStore {
  // Ensure the directory exists
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new DatabaseSync(storagePath);

  // Enable WAL mode, foreign keys, and busy timeout
  db.exec(`PRAGMA journal_mode=WAL;`);
  db.exec(`PRAGMA foreign_keys=ON;`);
  db.exec(`PRAGMA busy_timeout=5000;`);

  // Create devices table (token column stores sha256:<hex> hash)
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      capabilities TEXT,
      last_seen TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token)`);

  // Migrate any legacy plaintext device tokens to SHA-256 hashes at startup
  const legacyDevices = db
    .prepare(`SELECT id, token FROM devices WHERE token NOT LIKE 'sha256:%'`)
    .all() as Array<{ id: string; token: string }>;
  if (legacyDevices.length > 0) {
    const migrateStmt = db.prepare(`UPDATE devices SET token = ? WHERE id = ?`);
    db.exec("BEGIN");
    try {
      for (const row of legacyDevices) {
        if (!isHashedSecret(row.token)) {
          migrateStmt.run(hashSecret(row.token), row.id);
        }
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  // Prepare statements
  const insertDevice = db.prepare(`
    INSERT INTO devices (id, name, token, capabilities, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const selectDeviceById = db.prepare(`SELECT * FROM devices WHERE id = ?`);
  const selectDeviceByToken = db.prepare(`SELECT * FROM devices WHERE token = ?`);
  const selectAllDevices = db.prepare(`SELECT * FROM devices ORDER BY created_at DESC, rowid DESC`);
  const updateHeartbeat = db.prepare(`UPDATE devices SET last_seen = ? WHERE id = ?`);
  const deleteDeviceStmt = db.prepare(`DELETE FROM devices WHERE id = ?`);

  return {
    async registerDevice(name: string, capabilities?: string): Promise<Device> {
      const id = generateDeviceId();
      const rawToken = generateDeviceToken();
      const tokenHash = hashSecret(rawToken);
      const now = new Date().toISOString();

      insertDevice.run(id, name, tokenHash, capabilities ?? null, now);

      const row = selectDeviceById.get(id) as Record<string, unknown>;
      // Return plaintext device token once upon registration
      return { ...rowToDevice(row), token: rawToken };
    },

    async listDevices(): Promise<Device[]> {
      const rows = selectAllDevices.all() as Array<Record<string, unknown>>;
      return rows.map(rowToDevice);
    },

    async getDevice(id: string): Promise<Device | undefined> {
      const row = selectDeviceById.get(id) as Record<string, unknown> | undefined;
      return row ? rowToDevice(row) : undefined;
    },

    async getDeviceByToken(token: string): Promise<Device | undefined> {
      const tokenHash = isHashedSecret(token) ? token : hashSecret(token);
      const row = selectDeviceByToken.get(tokenHash) as Record<string, unknown> | undefined;
      return row ? rowToDevice(row) : undefined;
    },

    async updateDeviceHeartbeat(id: string): Promise<void> {
      const now = new Date().toISOString();
      Number(updateHeartbeat.run(now, id));
    },

    async deleteDevice(id: string): Promise<boolean> {
      const result = deleteDeviceStmt.run(id);
      return Number(result.changes) > 0;
    },

    close(): void {
      db.close();
    },
  };
}
