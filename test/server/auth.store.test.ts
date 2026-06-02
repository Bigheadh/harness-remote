import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createUserStore, type UserStore } from "../../src/server/auth/store.js";
import { hasPermission, getRolePermissions, VALID_ROLES } from "../../src/server/auth/roles.js";
import type { UserRole } from "../../src/shared/types.js";

describe("UserStore", () => {
  let tempDir: string;
  let store: UserStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "auth-store-test-"));
    store = createUserStore(join(tempDir, "users.sqlite"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("createUser", () => {
    it("should create a user with generated id and token", async () => {
      const user = await store.createUser("alice", "admin");
      expect(user.id).toMatch(/^usr_/);
      expect(user.username).toBe("alice");
      expect(user.token).toMatch(/^utoken_/);
      expect(user.role).toBe("admin");
      expect(user.createdAt).toBeTruthy();
      expect(user.updatedAt).toBeTruthy();
    });

    it("should create a user with feishu user id", async () => {
      const user = await store.createUser("bob", "operator", "ou_123");
      expect(user.feishuUserId).toBe("ou_123");
    });

    it("should create a user with viewer role", async () => {
      const user = await store.createUser("charlie", "viewer");
      expect(user.role).toBe("viewer");
    });

    it("should reject duplicate username", async () => {
      await store.createUser("alice", "admin");
      await expect(store.createUser("alice", "viewer")).rejects.toThrow();
    });
  });

  describe("getUserById", () => {
    it("should return user by id", async () => {
      const created = await store.createUser("alice", "admin");
      const found = await store.getUserById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.username).toBe("alice");
    });

    it("should return undefined for non-existent id", async () => {
      const found = await store.getUserById("usr_nonexistent");
      expect(found).toBeUndefined();
    });
  });

  describe("getUserByToken", () => {
    it("should return user by token", async () => {
      const created = await store.createUser("alice", "admin");
      const found = await store.getUserByToken(created.token);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it("should return undefined for non-existent token", async () => {
      const found = await store.getUserByToken("utoken_nonexistent");
      expect(found).toBeUndefined();
    });
  });

  describe("getUserByUsername", () => {
    it("should return user by username", async () => {
      await store.createUser("alice", "admin");
      const found = await store.getUserByUsername("alice");
      expect(found).toBeDefined();
      expect(found!.username).toBe("alice");
    });

    it("should return undefined for non-existent username", async () => {
      const found = await store.getUserByUsername("nonexistent");
      expect(found).toBeUndefined();
    });
  });

  describe("listUsers", () => {
    it("should list all users", async () => {
      await store.createUser("alice", "admin");
      await store.createUser("bob", "operator");
      await store.createUser("charlie", "viewer");

      const users = await store.listUsers();
      expect(users).toHaveLength(3);
      expect(users.map((u) => u.username).sort()).toEqual(["alice", "bob", "charlie"]);
    });

    it("should return empty array when no users", async () => {
      const users = await store.listUsers();
      expect(users).toHaveLength(0);
    });
  });

  describe("updateUserRole", () => {
    it("should update user role", async () => {
      const user = await store.createUser("alice", "viewer");
      const updated = await store.updateUserRole(user.id, "admin");
      expect(updated.role).toBe("admin");
      expect(updated.id).toBe(user.id);
    });

    it("should throw for non-existent user", async () => {
      await expect(store.updateUserRole("usr_nonexistent", "admin")).rejects.toThrow(
        "not found",
      );
    });
  });

  describe("deleteUser", () => {
    it("should delete existing user", async () => {
      const user = await store.createUser("alice", "admin");
      const deleted = await store.deleteUser(user.id);
      expect(deleted).toBe(true);

      const found = await store.getUserById(user.id);
      expect(found).toBeUndefined();
    });

    it("should return false for non-existent user", async () => {
      const deleted = await store.deleteUser("usr_nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("regenerateToken", () => {
    it("should generate a new token", async () => {
      const user = await store.createUser("alice", "admin");
      const originalToken = user.token;

      const updated = await store.regenerateToken(user.id);
      expect(updated.token).not.toBe(originalToken);
      expect(updated.token).toMatch(/^utoken_/);
    });

    it("should not find user by old token after regeneration", async () => {
      const user = await store.createUser("alice", "admin");
      const oldToken = user.token;

      await store.regenerateToken(user.id);

      const found = await store.getUserByToken(oldToken);
      expect(found).toBeUndefined();
    });

    it("should throw for non-existent user", async () => {
      await expect(store.regenerateToken("usr_nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("countUsers", () => {
    it("should return 0 when no users", async () => {
      const count = await store.countUsers();
      expect(count).toBe(0);
    });

    it("should return correct count", async () => {
      await store.createUser("alice", "admin");
      await store.createUser("bob", "operator");
      const count = await store.countUsers();
      expect(count).toBe(2);
    });
  });
});

describe("RBAC roles", () => {
  it("should define three valid roles", () => {
    expect(VALID_ROLES).toEqual(["admin", "operator", "viewer"]);
  });

  describe("hasPermission", () => {
    it("admin should have all permissions", () => {
      const perms = getRolePermissions("admin");
      for (const perm of perms) {
        expect(hasPermission("admin", perm)).toBe(true);
      }
    });

    it("operator should have task/device permissions but not user management", () => {
      expect(hasPermission("operator", "tasks.read")).toBe(true);
      expect(hasPermission("operator", "tasks.write")).toBe(true);
      expect(hasPermission("operator", "tasks.status")).toBe(true);
      expect(hasPermission("operator", "devices.read")).toBe(true);
      expect(hasPermission("operator", "devices.write")).toBe(true);
      expect(hasPermission("operator", "audit.read")).toBe(true);
      expect(hasPermission("operator", "users.write")).toBe(false);
      expect(hasPermission("operator", "users.delete")).toBe(false);
      expect(hasPermission("operator", "devices.delete")).toBe(false);
    });

    it("viewer should only have read permissions", () => {
      expect(hasPermission("viewer", "tasks.read")).toBe(true);
      expect(hasPermission("viewer", "tasks.search")).toBe(true);
      expect(hasPermission("viewer", "devices.read")).toBe(true);
      expect(hasPermission("viewer", "audit.read")).toBe(true);
      expect(hasPermission("viewer", "dashboard.read")).toBe(true);
      expect(hasPermission("viewer", "tasks.write")).toBe(false);
      expect(hasPermission("viewer", "tasks.status")).toBe(false);
      expect(hasPermission("viewer", "devices.write")).toBe(false);
      expect(hasPermission("viewer", "users.write")).toBe(false);
    });

    it("should return false for unknown role", () => {
      expect(hasPermission("unknown" as UserRole, "tasks.read")).toBe(false);
    });
  });
});
