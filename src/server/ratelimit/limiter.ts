/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request counts per key (user ID or device ID) using a fixed-window
 * approach with sub-second granularity. Old entries are evicted on access
 * to keep memory bounded.
 */

export interface RateLimitConfig {
  /** Maximum requests allowed in the window. Default: 60 */
  maxRequests: number;
  /** Window duration in milliseconds. Default: 60000 (1 minute) */
  windowMs: number;
  /** Optional: per-user overrides keyed by user/device identifier */
  overrides?: Record<string, { maxRequests: number; windowMs?: number }>;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number; // Unix timestamp when the window resets
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private store = new Map<string, WindowEntry>();
  private config: RateLimitConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(config: RateLimitConfig) {
    this.config = {
      maxRequests: config.maxRequests ?? 60,
      windowMs: config.windowMs ?? 60_000,
      overrides: config.overrides,
    };

    // Periodic cleanup every 5 minutes to evict stale entries
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000);
    // Allow process to exit even if timer is running
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check and consume one request for the given key.
   * Returns whether the request is allowed along with rate limit metadata.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    const effective = this.getEffectiveConfig(key);
    const windowStart = Math.floor(now / effective.windowMs) * effective.windowMs;
    const resetMs = windowStart + effective.windowMs;

    const entry = this.store.get(key);

    if (!entry || entry.windowStart !== windowStart) {
      // New window — reset counter
      this.store.set(key, { count: 1, windowStart });
      return {
        allowed: true,
        limit: effective.maxRequests,
        remaining: effective.maxRequests - 1,
        resetMs,
      };
    }

    // Same window — increment counter
    entry.count++;

    const remaining = Math.max(0, effective.maxRequests - entry.count);
    const allowed = entry.count <= effective.maxRequests;

    return {
      allowed,
      limit: effective.maxRequests,
      remaining,
      resetMs,
    };
  }

  /**
   * Peek at the current rate limit state without consuming a request.
   */
  peek(key: string): RateLimitResult {
    const now = Date.now();
    const effective = this.getEffectiveConfig(key);
    const windowStart = Math.floor(now / effective.windowMs) * effective.windowMs;
    const resetMs = windowStart + effective.windowMs;

    const entry = this.store.get(key);

    if (!entry || entry.windowStart !== windowStart) {
      return {
        allowed: true,
        limit: effective.maxRequests,
        remaining: effective.maxRequests,
        resetMs,
      };
    }

    const remaining = Math.max(0, effective.maxRequests - entry.count);
    return {
      allowed: entry.count < effective.maxRequests,
      limit: effective.maxRequests,
      remaining,
      resetMs,
    };
  }

  /**
   * Get the effective config for a key, applying overrides if present.
   */
  private getEffectiveConfig(key: string): { maxRequests: number; windowMs: number } {
    const override = this.config.overrides?.[key];
    if (override) {
      return {
        maxRequests: override.maxRequests,
        windowMs: override.windowMs ?? this.config.windowMs,
      };
    }
    return {
      maxRequests: this.config.maxRequests,
      windowMs: this.config.windowMs,
    };
  }

  /**
   * Evict entries from expired windows to prevent unbounded memory growth.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.windowStart > this.config.windowMs * 2) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get the number of tracked keys (for monitoring/debugging).
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Destroy the limiter (stop cleanup timer).
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}
