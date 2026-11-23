import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { User, UserRole } from "../../shared/types.js";
import { hashSecret, isHashedSecret } from "./token-hash.js";

export interface UserStore {
  createUser(username: string, role: UserRole, feishuUserId?: string): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByToken(token: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;
  updateUserRole(id: string, role: UserRole): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  regenerateToken(id: string): Promise<User>;
  countUsers(): Promise<number>;
  close?(): void;
}

function generateUserId(): string {
  return `usr_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

function generateUserToken(): string {
  return `utoken_${randomBytes(24).toString("hex")}`;
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row["id"] as string,
    username: row["username"] as string,
    token: row["token"] as string,
    role: row["role"] as UserRole,
    feishuUserId: (row["feishu_user_id"] as string) ?? undefined,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function createUserStore(storagePath: string): UserStore {
  mkdirSync(dirname(storagePath), { recursive: true });

  const db = new DatabaseSync(storagePath);

  // Enable WAL mode, foreign keys, and busy timeout
  db.exec(`PRAGMA journal_mode=WAL;`);
  db.exec(`PRAGMA foreign_keys=ON;`);
  db.exec(`PRAGMA busy_timeout=5000;`);

  // Create users table (token column stores sha256:<hex> hash)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      token TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'viewer')),
      feishu_user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Index for token hash lookups (the hot path)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_token ON users(token)`);

  // Migrate any legacy plaintext tokens to SHA-256 hashes at startup
  const legacyRows = db
    .prepare(`SELECT id, token FROM users WHERE token NOT LIKE 'sha256:%'`)
    .all() as Array<{ id: string; token: string }>;
  if (legacyRows.length > 0) {
    const migrateStmt = db.prepare(`UPDATE users SET token = ? WHERE id = ?`);
    db.exec("BEGIN");
    try {
      for (const row of legacyRows) {
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
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, token, role, feishu_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const selectById = db.prepare(`SELECT * FROM users WHERE id = ?`);
  const selectByToken = db.prepare(`SELECT * FROM users WHERE token = ?`);
  const selectByUsername = db.prepare(`SELECT * FROM users WHERE username = ?`);
  const selectAll = db.prepare(`SELECT * FROM users ORDER BY created_at DESC`);
  const countAll = db.prepare(`SELECT COUNT(*) as cnt FROM users`);

  const updateRole = db.prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`);
  const updateToken = db.prepare(`UPDATE users SET token = ?, updated_at = ? WHERE id = ?`);
  const deleteById = db.prepare(`DELETE FROM users WHERE id = ?`);

  return {
    async createUser(username: string, role: UserRole, feishuUserId?: string): Promise<User> {
      const id = generateUserId();
      const rawToken = generateUserToken();
      const tokenHash = hashSecret(rawToken);
      const now = new Date().toISOString();

      insertUser.run(id, username, tokenHash, role, feishuUserId ?? null, now, now);

      const row = selectById.get(id) as Record<string, unknown>;
      // Return plaintext token once upon creation; database only holds the SHA-256 hash
      return { ...rowToUser(row), token: rawToken };
    },

    async getUserById(id: string): Promise<User | undefined> {
      const row = selectById.get(id) as Record<string, unknown> | undefined;
      return row ? rowToUser(row) : undefined;
    },

    async getUserByToken(token: string): Promise<User | undefined> {
      const tokenHash = isHashedSecret(token) ? token : hashSecret(token);
      const row = selectByToken.get(tokenHash) as Record<string, unknown> | undefined;
      return row ? rowToUser(row) : undefined;
    },

    async getUserByUsername(username: string): Promise<User | undefined> {
      const row = selectByUsername.get(username) as Record<string, unknown> | undefined;
      return row ? rowToUser(row) : undefined;
    },

    async listUsers(): Promise<User[]> {
      const rows = selectAll.all() as Array<Record<string, unknown>>;
      return rows.map(rowToUser);
    },

    async updateUserRole(id: string, role: UserRole): Promise<User> {
      const now = new Date().toISOString();
      const result = updateRole.run(role, now, id);
      if (Number(result.changes) === 0) {
        throw new Error(`User not found: ${id}`);
      }
      const row = selectById.get(id) as Record<string, unknown>;
      return rowToUser(row);
    },

    async deleteUser(id: string): Promise<boolean> {
      const result = deleteById.run(id);
      return Number(result.changes) > 0;
    },

    async regenerateToken(id: string): Promise<User> {
      const rawToken = generateUserToken();
      const tokenHash = hashSecret(rawToken);
      const now = new Date().toISOString();
      const result = updateToken.run(tokenHash, now, id);
      if (Number(result.changes) === 0) {
        throw new Error(`User not found: ${id}`);
      }
      const row = selectById.get(id) as Record<string, unknown>;
      // Return plaintext token once upon regeneration
      return { ...rowToUser(row), token: rawToken };
    },

    async countUsers(): Promise<number> {
      const row = countAll.get() as Record<string, unknown>;
      return Number(row["cnt"]);
    },

    close(): void {
      db.close();
    },
  };
}
