import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RateLimiter } from "../../src/server/ratelimit/limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it("allows requests within the limit", () => {
    for (let i = 0; i < 5; i++) {
      const result = limiter.consume("user:alice");
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(5 - i - 1);
    }
  });

  it("blocks requests exceeding the limit", () => {
    for (let i = 0; i < 5; i++) {
      limiter.consume("user:alice");
    }
    const result = limiter.consume("user:alice");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks different keys independently", () => {
    for (let i = 0; i < 5; i++) {
      limiter.consume("user:alice");
    }
    // Alice is at limit
    expect(limiter.consume("user:alice").allowed).toBe(false);
    // Bob is fine
    expect(limiter.consume("user:bob").allowed).toBe(true);
  });

  it("resets after window expires", async () => {
    // Use a very short window for testing
    limiter.destroy();
    limiter = new RateLimiter({ maxRequests: 2, windowMs: 50 });

    expect(limiter.consume("user:alice").allowed).toBe(true);
    expect(limiter.consume("user:alice").allowed).toBe(true);
    expect(limiter.consume("user:alice").allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    const result = limiter.consume("user:alice");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("returns correct resetMs", () => {
    const result = limiter.consume("user:alice");
    expect(result.resetMs).toBeGreaterThan(Date.now());
    // resetMs should be within one window of now
    expect(result.resetMs - Date.now()).toBeLessThanOrEqual(1000);
  });

  it("supports per-key overrides", () => {
    limiter.destroy();
    limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      overrides: {
        "user:admin": { maxRequests: 100 },
      },
    });

    // Admin gets 100 requests
    for (let i = 0; i < 100; i++) {
      const result = limiter.consume("user:admin");
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
    }
    // 101st should be blocked
    expect(limiter.consume("user:admin").allowed).toBe(false);

    // Regular user still gets 5
    for (let i = 0; i < 5; i++) {
      expect(limiter.consume("user:normal").allowed).toBe(true);
    }
    expect(limiter.consume("user:normal").allowed).toBe(false);
  });

  it("peek does not consume a request", () => {
    const before = limiter.peek("user:alice");
    expect(before.remaining).toBe(5);

    const after = limiter.peek("user:alice");
    expect(after.remaining).toBe(5);

    // Consume one
    limiter.consume("user:alice");
    const peekAfterConsume = limiter.peek("user:alice");
    expect(peekAfterConsume.remaining).toBe(4);
  });

  it("size reflects tracked keys", () => {
    expect(limiter.size).toBe(0);
    limiter.consume("user:alice");
    expect(limiter.size).toBe(1);
    limiter.consume("user:bob");
    expect(limiter.size).toBe(2);
    // Same key doesn't increase size
    limiter.consume("user:alice");
    expect(limiter.size).toBe(2);
  });

  it("cleanup removes expired entries", async () => {
    limiter.destroy();
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 30 });

    limiter.consume("user:alice");
    limiter.consume("user:bob");
    expect(limiter.size).toBe(2);

    // Wait for window to expire (2x window for cleanup threshold)
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Manually trigger cleanup (since interval might not fire in test)
    // Access private method via bracket notation for testing
    (limiter as unknown as { cleanup: () => void }).cleanup();

    expect(limiter.size).toBe(0);
  });
});
