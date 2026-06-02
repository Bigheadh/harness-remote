import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Device } from "../../shared/types.js";

export interface DeviceStore {
  registerDevice(name: string, capabilities?: string): Promise<Device>;
  listDevices(): Promise<Device[]>;
  getDevice(id: string): Promise<Device | undefined>;
  getDeviceByToken(token: string): Promise<Device | undefined>;
  updateDeviceHeartbeat(id: string): Promise<void>;
  deleteDevice(id: string): Promise<boolean>;
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

  // Enable WAL mode
  db.exec(`PRAGMA journal_mode=WAL;`);

  // Create devices table
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

  // Prepare statements
  const insertDevice = db.prepare(`
    INSERT INTO devices (id, name, token, capabilities, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const selectDeviceById = db.prepare(`SELECT * FROM devices WHERE id = ?`);
  const selectDeviceByToken = db.prepare(`SELECT * FROM devices WHERE token = ?`);
  const selectAllDevices = db.prepare(`SELECT * FROM devices ORDER BY created_at DESC`);
  const updateHeartbeat = db.prepare(`UPDATE devices SET last_seen = ? WHERE id = ?`);
  const deleteDeviceStmt = db.prepare(`DELETE FROM devices WHERE id = ?`);

  return {
    async registerDevice(name: string, capabilities?: string): Promise<Device> {
      const id = generateDeviceId();
      const token = generateDeviceToken();
      const now = new Date().toISOString();

      insertDevice.run(id, name, token, capabilities ?? null, now);

      const row = selectDeviceById.get(id) as Record<string, unknown>;
      return rowToDevice(row);
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
      const row = selectDeviceByToken.get(token) as Record<string, unknown> | undefined;
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
  };
}
