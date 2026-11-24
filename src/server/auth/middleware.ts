import type { FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { UserStore } from "./store.js";
import type { ApiKeyStore } from "./apikeys/store.js";
import type { User, UserRole } from "../../shared/types.js";
import type { Permission } from "./roles.js";
import { hasPermission } from "./roles.js";
import { AppError } from "../../shared/errors.js";
import { verifySecret } from "./token-hash.js";

/**
 * Result of authenticating a request.
 */
export interface AuthContext {
  /** The authenticated user, or undefined if authenticated via personalToken (super admin) */
  user?: User;
  /** The effective role: "admin" for personalToken, or the user's role */
  role: UserRole;
  /** Whether authenticated via the super admin personalToken */
  isSuperAdmin: boolean;
}

/**
 * Timing-safe string comparison.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Extract the Bearer token from the Authorization header.
 */
export function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) return undefined;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : undefined;
}

/**
 * Authenticate a request using the super admin personalToken, per-user tokens, or API keys.
 *
 * 1. Try matching against the super admin personalToken → returns admin role.
 * 2. If not, look up the token in the user store → returns the user's role.
 * 3. If not, look up the token in the API key store (current or previous within grace period).
 * 4. If neither matches, throws AppError "unauthorized".
 */
export async function authenticate(
  authorizationHeader: string | undefined,
  personalToken: string,
  userStore: UserStore | undefined,
  apiKeyStore?: ApiKeyStore,
): Promise<AuthContext> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    throw new AppError("unauthorized", "Missing Authorization header");
  }

  // Check super admin token first (timing-safe)
  if (safeCompare(token, personalToken)) {
    return { role: "admin", isSuperAdmin: true };
  }

  // Check per-user tokens if RBAC is enabled
  if (userStore) {
    const user = await userStore.getUserByToken(token);
    if (user) {
      return { user, role: user.role, isSuperAdmin: false };
    }
  }

  // Check API keys (current key or previous key within grace period)
  if (apiKeyStore) {
    const apiKey = await apiKeyStore.getApiKeyByKey(token);
    if (apiKey) {
      if (apiKey.enabled) {
        // Mark as used for tracking
        await apiKeyStore.markLastUsed(apiKey.id);
        return {
          user: {
            id: apiKey.userId,
            username: apiKey.name,
            token: apiKey.key,
            role: apiKey.role,
            createdAt: apiKey.createdAt,
            updatedAt: apiKey.updatedAt,
          },
          role: apiKey.role,
          isSuperAdmin: false,
        };
      }
      // Key exists but is disabled — still reject
    }

    // Check previous key (grace period) using indexed lookup when available
    const prevKeyMatch = apiKeyStore.getApiKeyByPreviousKey
      ? await apiKeyStore.getApiKeyByPreviousKey(token)
      : (await apiKeyStore.listApiKeys()).find(
          (ak) => ak.previousKey !== null && verifySecret(token, ak.previousKey),
        );

    if (prevKeyMatch && prevKeyMatch.previousKey && prevKeyMatch.previousKeyExpiresAt && verifySecret(token, prevKeyMatch.previousKey)) {
      const now = new Date();
      const expiresAt = new Date(prevKeyMatch.previousKeyExpiresAt);
      if (now < expiresAt && prevKeyMatch.enabled) {
        await apiKeyStore.markLastUsed(prevKeyMatch.id);
        return {
          user: {
            id: prevKeyMatch.userId,
            username: prevKeyMatch.name,
            token: prevKeyMatch.key,
            role: prevKeyMatch.role,
            createdAt: prevKeyMatch.createdAt,
            updatedAt: prevKeyMatch.updatedAt,
          },
          role: prevKeyMatch.role,
          isSuperAdmin: false,
        };
      }
    }
  }

  throw new AppError("unauthorized", "Invalid bearer token");
}

/**
 * Check if the authenticated context has a specific permission.
 * Throws AppError "forbidden" if not authorized.
 */
export function authorize(authCtx: AuthContext, permission: Permission): void {
  if (!hasPermission(authCtx.role, permission)) {
    throw new AppError(
      "forbidden",
      `Insufficient permissions: requires '${permission}' but role '${authCtx.role}' does not have it`,
    );
  }
}

/**
 * Extract `req.authCtx` and enforce `permission`, sending a 403 response and returning `undefined` on denial.
 */
export function requireAuthz(
  req: { authCtx?: AuthContext },
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  permission: Permission,
): AuthContext | undefined {
  const authCtx = req.authCtx;
  if (!authCtx) {
    reply.code(401).send({ error: { code: "unauthorized", message: "Missing authentication context" } });
    return undefined;
  }
  try {
    authorize(authCtx, permission);
    return authCtx;
  } catch (e) {
    if (e instanceof AppError) {
      reply.code(403).send({ error: { code: e.code, message: e.message } });
      return undefined;
    }
    throw e;
  }
}
