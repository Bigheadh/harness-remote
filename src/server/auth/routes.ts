import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { UserStore } from "./store.js";
import type { UserRole } from "../../shared/types.js";
import { authenticate, authorize } from "./middleware.js";
import { VALID_ROLES } from "./roles.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

export function registerUserRoutes(
  server: FastifyInstance,
  store: UserStore,
  personalToken: string,
): void {
  // Auth hook for /api/users routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith("/api/users")) return;
    try {
      const authCtx = await authenticate(req.headers["authorization"], personalToken, store);
      authorize(authCtx, "users.read");
      // Attach auth context to request for downstream handlers
      (req as FastifyRequest & { authCtx?: typeof authCtx }).authCtx = authCtx;
    } catch (e) {
      if (e instanceof AppError) {
        const status = e.code === "unauthorized" ? 401 : 403;
        return reply.code(status).send({
          error: { code: e.code, message: e.message },
        });
      }
      return reply.code(401).send({
        error: { code: "unauthorized", message: "Missing or invalid bearer token" },
      });
    }
  });

  // POST /api/users - create user (admin only)
  server.post("/api/users", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "users.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({
          error: { code: e.code, message: e.message },
        });
      }
      throw e;
    }

    const body = req.body as { username?: string; role?: string; feishuUserId?: string } | undefined;

    if (typeof body?.username !== "string" || body.username.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'username' (non-empty string)" },
      });
    }

    const role = (body.role ?? "viewer") as UserRole;
    if (!VALID_ROLES.includes(role)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid role: ${body.role}. Must be one of: ${VALID_ROLES.join(", ")}` },
      });
    }

    // Check for duplicate username
    const existing = await store.getUserByUsername(body.username.trim());
    if (existing) {
      return reply.code(409).send({
        error: { code: "invalid_request", message: `Username already exists: ${body.username}` },
      });
    }

    const user = await store.createUser(body.username.trim(), role, body.feishuUserId);
    log.info({ userId: user.id, username: user.username, role: user.role }, "User created");

    // Return user with token so admin can share it
    return reply.code(201).send({ user });
  });

  // GET /api/users - list all users (admin only)
  server.get("/api/users", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "users.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({
          error: { code: e.code, message: e.message },
        });
      }
      throw e;
    }

    const users = await store.listUsers();
    return reply.send({ users });
  });

  // GET /api/users/:id - get user details (admin only)
  server.get<{ Params: { id: string } }>("/api/users/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "users.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({
          error: { code: e.code, message: e.message },
        });
      }
      throw e;
    }

    const { id } = req.params;
    const user = await store.getUserById(id);
    if (!user) {
      return reply.code(404).send({
        error: { code: "not_found", message: `User not found: ${id}` },
      });
    }
    return reply.send({ user });
  });

  // PATCH /api/users/:id/role - change user role (admin only)
  server.patch<{ Params: { id: string }; Body: { role: string } }>("/api/users/:id/role", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "users.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({
          error: { code: e.code, message: e.message },
        });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { role?: string };

    if (!body?.role || !VALID_ROLES.includes(body.role as UserRole)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid role: ${body?.role}. Must be one of: ${VALID_ROLES.join(", ")}` },
      });
    }

    try {
      const user = await store.updateUserRole(id, body.role as UserRole);
      log.info({ userId: id, newRole: body.role }, "User role updated");
      return reply.send({ user });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `User not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/users/:id - delete user (admin only)
  server.delete<{ Params: { id: string } }>("/api/users/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "users.delete");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({
          error: { code: e.code, message: e.message },
        });
      }
      throw e;
    }

    const { id } = req.params;
    const deleted = await store.deleteUser(id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `User not found: ${id}` },
      });
    }
    log.info({ userId: id }, "User deleted");
    return reply.send({ ok: true });
  });

  // POST /api/users/:id/token/regenerate - regenerate user token (admin only)
  server.post<{ Params: { id: string } }>("/api/users/:id/token/regenerate", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "users.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({
          error: { code: e.code, message: e.message },
        });
      }
      throw e;
    }

    const { id } = req.params;
    try {
      const user = await store.regenerateToken(id);
      log.info({ userId: id }, "User token regenerated");
      return reply.send({ user });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `User not found: ${id}` },
        });
      }
      throw e;
    }
  });
}
