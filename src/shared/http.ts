import { AppError } from "./errors.js";

export const AUTHORIZATION_HEADER = "authorization";

/**
 * Validate that the Authorization header contains a valid Bearer token.
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
  if (token !== expectedToken) {
    throw new AppError("unauthorized", "Invalid bearer token");
  }

  return token;
}
