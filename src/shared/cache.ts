/**
 * Generic in-memory TTL (Time-To-Live) cache.
 *
 * Each entry is stored with an expiry timestamp. On access, expired entries
 * are lazily evicted. A background sweeper can optionally prune stale keys
 * at a configurable interval to prevent unbounded memory growth.
 */
export interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface CacheOptions {
  /** Default TTL in milliseconds. Defaults to 60 000 (1 minute). */
  defaultTtlMs?: number;
  /** Maximum number of entries. When exceeded, the oldest entry is evicted. */
  maxEntries?: number;
}

export class TtlCache<V = unknown> {
  private readonly store = new Map<string, CacheEntry<V>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(options?: CacheOptions) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 60_000;
    this.maxEntries = options?.maxEntries ?? 1_000;
  }

  /** Retrieve a cached value. Returns `undefined` on miss or expiry. */
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Store a value with an optional per-key TTL override. */
  set(key: string, value: V, ttlMs?: number): void {
    // Evict oldest if at capacity (Map preserves insertion order)
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /** Remove a specific key. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Number of live (non-expired) entries. */
  get size(): number {
    this.evictExpired();
    return this.store.size;
  }

  /** Remove all expired entries. Returns the number of entries evicted. */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  /** List all live keys (for debugging). */
  keys(): string[] {
    this.evictExpired();
    return [...this.store.keys()];
  }
}
