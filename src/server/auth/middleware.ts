import type { FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { UserStore } from "./store.js";
import type { ApiKeyStore } from "./apikeys/store.js";
import type { User, UserRole } from "../../shared/types.js";
import type { Permission } from "./roles.js";
import { hasPermission } from "./roles.js";
import { AppError } from "../../shared/errors.js";

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

    // Check all API keys for a matching previous key (grace period)
    const allKeys = await apiKeyStore.listApiKeys();
    for (const ak of allKeys) {
      if (!ak.previousKey || !ak.previousKeyExpiresAt) continue;
      if (!safeCompare(token, ak.previousKey)) continue;

      // Check if grace period is still active
      const now = new Date();
      const expiresAt = new Date(ak.previousKeyExpiresAt);
      if (now < expiresAt && ak.enabled) {
        await apiKeyStore.markLastUsed(ak.id);
        return {
          user: {
            id: ak.userId,
            username: ak.name,
            token: ak.key,
            role: ak.role,
            createdAt: ak.createdAt,
            updatedAt: ak.updatedAt,
          },
          role: ak.role,
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
