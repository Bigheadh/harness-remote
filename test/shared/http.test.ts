import { describe, it, expect } from "vitest";
import { requireBearerToken, AUTHORIZATION_HEADER } from "../../src/shared/http.js";
import { AppError } from "../../src/shared/errors.js";

describe("requireBearerToken", () => {
  const validToken = "test-token-123";

  it("returns the token when Authorization header is valid", () => {
    const result = requireBearerToken("Bearer test-token-123", validToken);
    expect(result).toBe(validToken);
  });

  it("is case-insensitive for 'Bearer' prefix", () => {
    const result = requireBearerToken("bearer test-token-123", validToken);
    expect(result).toBe(validToken);

    const result2 = requireBearerToken("BEARER test-token-123", validToken);
    expect(result2).toBe(validToken);
  });

  it("trims whitespace from token", () => {
    const result = requireBearerToken("Bearer   test-token-123  ", validToken);
    expect(result).toBe(validToken);
  });

  it("throws AppError when Authorization header is undefined", () => {
    expect(() => requireBearerToken(undefined, validToken)).toThrow(AppError);
    try {
      requireBearerToken(undefined, validToken);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("unauthorized");
      expect((err as AppError).message).toContain("Missing Authorization header");
    }
  });

  it("throws AppError when Authorization header is empty string", () => {
    expect(() => requireBearerToken("", validToken)).toThrow(AppError);
    try {
      requireBearerToken("", validToken);
    } catch (err) {
      expect((err as AppError).code).toBe("unauthorized");
    }
  });

  it("throws AppError when header has wrong format (no Bearer prefix)", () => {
    expect(() => requireBearerToken("Token abc", validToken)).toThrow(AppError);
    try {
      requireBearerToken("Token abc", validToken);
    } catch (err) {
      expect((err as AppError).code).toBe("unauthorized");
      expect((err as AppError).message).toContain("Invalid Authorization header format");
    }
  });

  it("throws AppError when header has wrong format (Basic auth)", () => {
    expect(() => requireBearerToken("Basic dXNlcjpwYXNz", validToken)).toThrow(AppError);
  });

  it("throws AppError when token does not match expected", () => {
    expect(() => requireBearerToken("Bearer wrong-token", validToken)).toThrow(AppError);
    try {
      requireBearerToken("Bearer wrong-token", validToken);
    } catch (err) {
      expect((err as AppError).code).toBe("unauthorized");
      expect((err as AppError).message).toContain("Invalid bearer token");
    }
  });

  it("throws AppError when Bearer prefix has no token", () => {
    // "Bearer " with trailing space does not match the regex because
    // .+ requires at least one character, so it's treated as invalid format.
    expect(() => requireBearerToken("Bearer ", validToken)).toThrow(AppError);
    try {
      requireBearerToken("Bearer ", validToken);
    } catch (err) {
      expect((err as AppError).code).toBe("unauthorized");
      expect((err as AppError).message).toContain("Invalid Authorization header format");
    }
  });
});

describe("AUTHORIZATION_HEADER constant", () => {
  it("equals lowercase 'authorization'", () => {
    expect(AUTHORIZATION_HEADER).toBe("authorization");
  });
});
