import { describe, it, expect, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { mkdirSync, rmSync } from "node:fs";
import { hashSecret, isHashedSecret, verifySecret } from "../../src/server/auth/token-hash.js";
import { createUserStore } from "../../src/server/auth/store.js";
import { createApiKeyStore } from "../../src/server/auth/apikeys/store.js";
import { createDeviceStore } from "../../src/server/devices/store.js";
import { authenticate } from "../../src/server/auth/middleware.js";
import { createTaskStore } from "../../src/server/tasks/store.js";
import { registerTaskRoutes } from "../../src/server/tasks/routes.js";

const TMP_DIR = "/tmp/harness-remote-step2-test";
const PERSONAL_TOKEN = "step2-super-admin-token-1234567890";

function freshDir(): string {
  const dir = `${TMP_DIR}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("Step 2: SHA-256 Credential Hashing & Modular Subroutes", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  // ── 1. Token Hashing Utilities ───────────────────────────────────────────

  it("hashes secrets deterministically and verifies in constant time", () => {
    const raw = "utoken_abcdef1234567890";
    const hashed = hashSecret(raw);
    expect(isHashedSecret(hashed)).toBe(true);
    expect(isHashedSecret(raw)).toBe(false);
    expect(verifySecret(raw, hashed)).toBe(true);
    expect(verifySecret("utoken_wrong", hashed)).toBe(false);
    // Supports legacy plaintext fallback
    expect(verifySecret(raw, raw)).toBe(true);
  });

  // ── 2. UserStore Hashing + Legacy Migration ──────────────────────────────

  it("persists user tokens as SHA-256 hashes and auto-migrates legacy plaintext rows", async () => {
    const dir = freshDir();
    const dbPath = `${dir}/users.sqlite`;

    // Seed a legacy DB with a plaintext token
    const rawDb = new DatabaseSync(dbPath);
    rawDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        token TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        feishu_user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO users VALUES ('usr_legacy', 'legacy_user', 'utoken_legacy_plain_123', 'operator', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    `);
    rawDb.close();

    // Opening UserStore should automatically migrate the legacy plaintext row
    const userStore = createUserStore(dbPath);
    const legacyAuth = await userStore.getUserByToken("utoken_legacy_plain_123");
    expect(legacyAuth?.id).toBe("usr_legacy");
    expect(legacyAuth?.token).toBe(hashSecret("utoken_legacy_plain_123"));

    // Newly created users return plaintext once, but DB stores only SHA-256 hash
    const created = await userStore.createUser("alice", "viewer");
    expect(created.token).toMatch(/^utoken_/);
    const fetchedById = await userStore.getUserById(created.id);
    expect(fetchedById?.token).toBe(hashSecret(created.token));
    expect(fetchedById?.token).not.toBe(created.token);

    // Authenticating via middleware succeeds with raw token
    const authCtx = await authenticate(`Bearer ${created.token}`, PERSONAL_TOKEN, userStore);
    expect(authCtx.user?.id).toBe(created.id);
    expect(authCtx.role).toBe("viewer");

    userStore.close?.();
  });

  // ── 3. ApiKeyStore Hashing + Legacy Migration ────────────────────────────

  it("persists API keys & previous keys as SHA-256 hashes and auto-migrates legacy rows", async () => {
    const dir = freshDir();
    const dbPath = `${dir}/apikeys.sqlite`;

    // Seed legacy plaintext API key & previous key
    const rawDb = new DatabaseSync(dbPath);
    rawDb.exec(`
      CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        previous_key TEXT,
        previous_key_expires_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO api_keys VALUES (
        'apikey_legacy', 'legacy-bot', 'ak_legacy_current', 'usr_1', 'operator',
        'ak_legacy_prev', '2099-01-01T00:00:00Z', 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
      );
    `);
    rawDb.close();

    const apiKeyStore = createApiKeyStore(dbPath);
    const stored = await apiKeyStore.getApiKeyById("apikey_legacy");
    expect(stored?.key).toBe(hashSecret("ak_legacy_current"));
    expect(stored?.previousKey).toBe(hashSecret("ak_legacy_prev"));

    // Both current and grace-period previous raw keys authenticate cleanly
    const curCtx = await authenticate("Bearer ak_legacy_current", PERSONAL_TOKEN, undefined, apiKeyStore);
    expect(curCtx.role).toBe("operator");

    const prevCtx = await authenticate("Bearer ak_legacy_prev", PERSONAL_TOKEN, undefined, apiKeyStore);
    expect(prevCtx.role).toBe("operator");

    apiKeyStore.close?.();
  });

  // ── 4. DeviceStore Hashing + Legacy Migration ────────────────────────────

  it("persists device tokens as SHA-256 hashes and auto-migrates legacy rows", async () => {
    const dir = freshDir();
    const dbPath = `${dir}/devices.sqlite`;

    const rawDb = new DatabaseSync(dbPath);
    rawDb.exec(`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        capabilities TEXT,
        last_seen TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO devices VALUES ('dev_legacy', 'old-laptop', 'dtoken_legacy_abc', NULL, NULL, '2026-01-01T00:00:00Z');
    `);
    rawDb.close();

    const deviceStore = createDeviceStore(dbPath);
    const migrated = await deviceStore.getDevice("dev_legacy");
    expect(migrated?.token).toBe(hashSecret("dtoken_legacy_abc"));
    expect((await deviceStore.getDeviceByToken("dtoken_legacy_abc"))?.id).toBe("dev_legacy");

    const registered = await deviceStore.registerDevice("new-workstation");
    expect(registered.token).toMatch(/^dtoken_/);
    const stored = await deviceStore.getDevice(registered.id);
    expect(stored?.token).toBe(hashSecret(registered.token));
    expect((await deviceStore.getDeviceByToken(registered.token))?.id).toBe(registered.id);

    deviceStore.close?.();
  });

  // ── 5. Modular Task Subroutes End-to-End Smoke Verification ──────────────

  it("registers all extracted subroute modules cleanly with intact route precedence", async () => {
    const dir = freshDir();
    const store = createTaskStore(`${dir}/tasks.sqlite`);
    const server = Fastify({ logger: false });
    registerTaskRoutes(server, store, PERSONAL_TOKEN);
    await server.ready();

    const headers = { authorization: `Bearer ${PERSONAL_TOKEN}` };

    // Templates subroute
    const tplRes = await server.inject({ method: "GET", url: "/api/templates", headers });
    expect(tplRes.statusCode).toBe(200);

    // SLA subroute
    const slaRes = await server.inject({ method: "GET", url: "/api/sla/policies", headers });
    expect(slaRes.statusCode).toBe(200);

    // Saved views subroute
    const viewsRes = await server.inject({ method: "GET", url: "/api/saved-views", headers });
    expect(viewsRes.statusCode).toBe(200);

    // Cycles subroute
    const cyclesRes = await server.inject({ method: "GET", url: "/api/cycles", headers });
    expect(cyclesRes.statusCode).toBe(200);

    // Modules subroute
    const modulesRes = await server.inject({ method: "GET", url: "/api/modules", headers });
    expect(modulesRes.statusCode).toBe(200);

    // Export subroute (must NOT be shadowed by /api/tasks/:id)
    const exportRes = await server.inject({ method: "GET", url: "/api/tasks/export", headers });
    expect(exportRes.statusCode).toBe(200);

    // Bulk subroute (must NOT be shadowed by /api/tasks/:id)
    const bulkRes = await server.inject({
      method: "POST",
      url: "/api/tasks/bulk/delete",
      headers,
      payload: { ids: [] },
    });
    expect(bulkRes.statusCode).toBe(400);

    await server.close();
    store.close?.();
  });
});
