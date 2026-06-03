import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TtlCache } from "../../src/shared/cache.js";

describe("TtlCache", () => {
  let cache: TtlCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new TtlCache<string>({ defaultTtlMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic get/set", () => {
    it("returns undefined on cache miss", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("stores and retrieves a value", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("overwrites existing key", () => {
      cache.set("key1", "v1");
      cache.set("key1", "v2");
      expect(cache.get("key1")).toBe("v2");
    });
  });

  describe("TTL expiration", () => {
    it("returns undefined after TTL expires", () => {
      cache.set("key1", "value1", 500);
      expect(cache.get("key1")).toBe("value1");

      vi.advanceTimersByTime(600);
      expect(cache.get("key1")).toBeUndefined();
    });

    it("uses default TTL when none specified", () => {
      cache.set("key1", "value1");
      vi.advanceTimersByTime(999);
      expect(cache.get("key1")).toBe("value1");

      vi.advanceTimersByTime(2);
      expect(cache.get("key1")).toBeUndefined();
    });

    it("respects per-key TTL override", () => {
      cache.set("short", "s", 100);
      cache.set("long", "l", 2000);

      vi.advanceTimersByTime(150);
      expect(cache.get("short")).toBeUndefined();
      expect(cache.get("long")).toBe("l");
    });
  });

  describe("eviction", () => {
    it("evicts oldest entry when maxEntries is reached", () => {
      const smallCache = new TtlCache<string>({ maxEntries: 3 });
      smallCache.set("a", "1");
      smallCache.set("b", "2");
      smallCache.set("c", "3");
      smallCache.set("d", "4"); // should evict "a"

      expect(smallCache.get("a")).toBeUndefined();
      expect(smallCache.get("b")).toBe("2");
      expect(smallCache.get("d")).toBe("4");
    });

    it("does not evict when updating existing key", () => {
      const smallCache = new TtlCache<string>({ maxEntries: 2 });
      smallCache.set("a", "1");
      smallCache.set("b", "2");
      smallCache.set("a", "updated"); // should NOT evict "b"

      expect(smallCache.get("a")).toBe("updated");
      expect(smallCache.get("b")).toBe("2");
    });
  });

  describe("delete and clear", () => {
    it("deletes a specific key", () => {
      cache.set("key1", "value1");
      expect(cache.delete("key1")).toBe(true);
      expect(cache.get("key1")).toBeUndefined();
    });

    it("returns false for non-existent key", () => {
      expect(cache.delete("nonexistent")).toBe(false);
    });

    it("clears all entries", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.clear();
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
    });
  });

  describe("size and eviction", () => {
    it("reports correct size after TTL expiry", () => {
      cache.set("key1", "value1", 100);
      expect(cache.size).toBe(1);

      vi.advanceTimersByTime(200);
      expect(cache.size).toBe(0);
    });

    it("evictExpired removes expired entries and returns count", () => {
      cache.set("a", "1", 100);
      cache.set("b", "2", 200);
      cache.set("c", "3", 300);

      vi.advanceTimersByTime(150);
      const evicted = cache.evictExpired();
      expect(evicted).toBe(1); // only "a" expired
      expect(cache.size).toBe(2);
    });
  });

  describe("keys", () => {
    it("returns only live keys", () => {
      cache.set("a", "1", 100);
      cache.set("b", "2", 500);

      vi.advanceTimersByTime(150);
      expect(cache.keys()).toEqual(["b"]);
    });
  });

  describe("generic typing", () => {
    it("works with complex value types", () => {
      const objCache = new TtlCache<{ count: number }>({ defaultTtlMs: 5000 });
      objCache.set("stats", { count: 42 });
      const val = objCache.get("stats");
      expect(val).toEqual({ count: 42 });
    });
  });
});
