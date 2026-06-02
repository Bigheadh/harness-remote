import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDeviceStore } from "../../src/server/devices/store.js";
import type { DeviceStore } from "../../src/server/devices/store.js";
import { unlinkSync } from "node:fs";

const TEST_DB = "/tmp/test-devices-store.db";

let store: DeviceStore;

beforeEach(() => {
  try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  try { unlinkSync(TEST_DB + "-wal"); } catch { /* ignore */ }
  try { unlinkSync(TEST_DB + "-shm"); } catch { /* ignore */ }
  store = createDeviceStore(TEST_DB);
});

afterEach(() => {
  try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  try { unlinkSync(TEST_DB + "-wal"); } catch { /* ignore */ }
  try { unlinkSync(TEST_DB + "-shm"); } catch { /* ignore */ }
});

describe("registerDevice", () => {
  it("registers a new device with name", async () => {
    const device = await store.registerDevice("office-desktop");
    expect(device.name).toBe("office-desktop");
    expect(device.id).toMatch(/^dev_/);
    expect(device.token).toMatch(/^dtoken_/);
    expect(device.capabilities).toBeUndefined();
    expect(device.lastSeen).toBeUndefined();
    expect(device.createdAt).toBeTruthy();
  });

  it("registers a device with capabilities", async () => {
    const device = await store.registerDevice("laptop-dev", "frontend,react,node");
    expect(device.name).toBe("laptop-dev");
    expect(device.capabilities).toBe("frontend,react,node");
  });

  it("generates unique IDs for different devices", async () => {
    const d1 = await store.registerDevice("device-1");
    const d2 = await store.registerDevice("device-2");
    expect(d1.id).not.toBe(d2.id);
    expect(d1.token).not.toBe(d2.token);
  });

  it("generates unique tokens", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const d = await store.registerDevice(`device-${i}`);
      tokens.add(d.token);
    }
    expect(tokens.size).toBe(10);
  });
});

describe("listDevices", () => {
  it("returns empty array when no devices", async () => {
    const devices = await store.listDevices();
    expect(devices).toHaveLength(0);
  });

  it("lists all registered devices", async () => {
    await store.registerDevice("device-1");
    await store.registerDevice("device-2");
    await store.registerDevice("device-3");

    const devices = await store.listDevices();
    expect(devices).toHaveLength(3);
  });

  it("returns devices sorted by creation time descending", async () => {
    const d1 = await store.registerDevice("first");
    const d2 = await store.registerDevice("second");
    const d3 = await store.registerDevice("third");

    const devices = await store.listDevices();
    expect(devices[0].id).toBe(d3.id);
    expect(devices[1].id).toBe(d2.id);
    expect(devices[2].id).toBe(d1.id);
  });
});

describe("getDevice", () => {
  it("returns device by ID", async () => {
    const registered = await store.registerDevice("test-device");
    const fetched = await store.getDevice(registered.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(registered.id);
    expect(fetched!.name).toBe("test-device");
  });

  it("returns undefined for nonexistent ID", async () => {
    const fetched = await store.getDevice("nonexistent");
    expect(fetched).toBeUndefined();
  });
});

describe("getDeviceByToken", () => {
  it("returns device by token", async () => {
    const registered = await store.registerDevice("token-test");
    const found = await store.getDeviceByToken(registered.token);
    expect(found).toBeDefined();
    expect(found!.id).toBe(registered.id);
    expect(found!.name).toBe("token-test");
  });

  it("returns undefined for unknown token", async () => {
    const found = await store.getDeviceByToken("unknown_token");
    expect(found).toBeUndefined();
  });

  it("returns correct device among multiple", async () => {
    const d1 = await store.registerDevice("device-1");
    const d2 = await store.registerDevice("device-2");

    const found1 = await store.getDeviceByToken(d1.token);
    const found2 = await store.getDeviceByToken(d2.token);

    expect(found1!.id).toBe(d1.id);
    expect(found2!.id).toBe(d2.id);
  });
});

describe("updateDeviceHeartbeat", () => {
  it("sets lastSeen timestamp", async () => {
    const device = await store.registerDevice("heartbeat-test");
    expect(device.lastSeen).toBeUndefined();

    await store.updateDeviceHeartbeat(device.id);

    const updated = await store.getDevice(device.id);
    expect(updated).toBeDefined();
    expect(updated!.lastSeen).toBeTruthy();
    expect(new Date(updated!.lastSeen!).getTime()).toBeGreaterThan(0);
  });

  it("updates lastSeen on subsequent calls", async () => {
    const device = await store.registerDevice("heartbeat-update");

    await store.updateDeviceHeartbeat(device.id);
    const first = await store.getDevice(device.id);

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));

    await store.updateDeviceHeartbeat(device.id);
    const second = await store.getDevice(device.id);

    expect(new Date(second!.lastSeen!).getTime()).toBeGreaterThanOrEqual(
      new Date(first!.lastSeen!).getTime(),
    );
  });
});

describe("deleteDevice", () => {
  it("deletes an existing device", async () => {
    const device = await store.registerDevice("to-delete");
    const deleted = await store.deleteDevice(device.id);
    expect(deleted).toBe(true);

    const fetched = await store.getDevice(device.id);
    expect(fetched).toBeUndefined();
  });

  it("returns false for nonexistent device", async () => {
    const deleted = await store.deleteDevice("nonexistent");
    expect(deleted).toBe(false);
  });

  it("does not affect other devices", async () => {
    const d1 = await store.registerDevice("keep");
    const d2 = await store.registerDevice("remove");

    await store.deleteDevice(d2.id);

    const remaining = await store.listDevices();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(d1.id);
  });
});
