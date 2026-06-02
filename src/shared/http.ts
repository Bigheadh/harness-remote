import { timingSafeEqual } from "node:crypto";
import { AppError } from "./errors.js";

export const AUTHORIZATION_HEADER = "authorization";

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Compares two strings in constant time regardless of where they differ.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to avoid length-based timing leak
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Validate that the Authorization header contains a valid Bearer token.
 * Uses timing-safe comparison to prevent timing attacks.
 * Returns the token string if valid, throws AppError otherwise.
 */
export function requireBearerToken(
  authorizationHeader: string | undefined,
  expectedToken: string,
): string {
  if (!authorizationHeader) {
    throw new AppError("unauthorized", "Missing Authorization header");
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AppError(
      "unauthorized",
      "Invalid Authorization header format, expected 'Bearer <token>'",
    );
  }

  const token = match[1].trim();
  if (!safeCompare(token, expectedToken)) {
    throw new AppError("unauthorized", "Invalid bearer token");
  }

  return token;
}
