import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
]);

/**
 * Returns true if an IPv4 address belongs to a private, loopback, link-local,
 * CGNAT, multicast, broadcast, or unspecified range.
 */
export function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;

  // 0.0.0.0/8 (unspecified / "this" network)
  if (a === 0) return true;
  // 10.0.0.0/8 (RFC 1918 private)
  if (a === 10) return true;
  // 100.64.0.0/10 (RFC 6598 CGNAT / shared address space)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local & cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (RFC 1918 private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24, 192.0.2.0/24 (IETF protocol / TEST-NET-1)
  if (a === 192 && b === 0) return true;
  // 192.168.0.0/16 (RFC 1918 private)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved / broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Returns true if an IPv6 address belongs to loopback, unspecified, ULA,
 * link-local, multicast, or embeds a blocked IPv4 address (::ffff:...).
 */
export function isBlockedIpv6(rawIp: string): boolean {
  const ip = rawIp.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];

  if (ip === "::" || ip === "::1") return true;

  // IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (ip.startsWith("::ffff:")) {
    const rest = ip.slice(7);
    if (isIP(rest) === 4) {
      return isBlockedIpv4(rest);
    }
    // Hex form: ::ffff:7f00:0001
    const hexParts = rest.split(":");
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isBlockedIpv4(ipv4);
      }
    }
    return true;
  }

  // Extract first 16-bit group
  const firstGroupHex = ip.split(":")[0];
  if (firstGroupHex) {
    const first = parseInt(firstGroupHex, 16);
    if (!Number.isNaN(first)) {
      // fc00::/7 (Unique Local Address)
      if ((first & 0xfe00) === 0xfc00) return true;
      // fe80::/10 (Link-Local)
      if ((first & 0xffc0) === 0xfe80) return true;
      // ff00::/8 (Multicast)
      if ((first & 0xff00) === 0xff00) return true;
    }
  }

  return false;
}

/**
 * Returns true if an IP (v4 or v6) is blocked for outbound webhook delivery.
 */
export function isBlockedIp(ip: string): boolean {
  const cleaned = ip.replace(/^\[|\]$/g, "");
  const version = isIP(cleaned);
  if (version === 4) return isBlockedIpv4(cleaned);
  if (version === 6) return isBlockedIpv6(cleaned);
  return true;
}

/**
 * Synchronously validate a webhook URL's syntax, protocol, and hostname/literal IP.
 * Throws an Error with a clear message if invalid or pointing to a disallowed target.
 */
export function validateWebhookUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use http:// or https:// protocol");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) {
    throw new Error("Webhook URL must include a valid hostname");
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(`Webhook target host '${hostname}' is not allowed`);
  }

  if (isIP(hostname) !== 0 && isBlockedIp(hostname)) {
    throw new Error(`Webhook target IP '${hostname}' is in a private or reserved range`);
  }

  return parsed;
}

/**
 * Validate a webhook URL including DNS resolution to prevent DNS rebinding / SSRF
 * against loopback, private networks, and cloud metadata endpoints.
 */
export async function assertSafeWebhookTarget(rawUrl: string): Promise<URL> {
  const parsed = validateWebhookUrl(rawUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIP(hostname) === 0) {
    const records = await lookup(hostname, { all: true });
    if (records.length === 0) {
      throw new Error(`Webhook target host '${hostname}' could not be resolved`);
    }
    for (const record of records) {
      if (isBlockedIp(record.address)) {
        throw new Error(
          `Webhook target host '${hostname}' resolved to blocked IP '${record.address}'`,
        );
      }
    }
  }

  return parsed;
}
