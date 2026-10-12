import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** An error whose message is safe to show to the end user. */
export class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserError";
    this.status = status;
  }
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast / reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();

  // IPv4-mapped addresses (::ffff:a.b.c.d). The URL parser rewrites these to
  // hex form (::ffff:7f00:1), so handle both spellings and check the embedded IPv4.
  const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIPv4(dotted[1]);
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  if (v.startsWith("::")) return true; // unspecified, loopback and IPv4-compatible forms
  if (v.startsWith("64:ff9b:")) return true; // NAT64 translation prefix
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  if (/^fe[89ab]/.test(v)) return true; // link-local
  return false;
}

function isPrivateIp(ip: string): boolean {
  return isIP(ip) === 4 ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

/**
 * Validates a user-supplied URL and makes sure it points at the public internet.
 * This stops the server being used to reach localhost, private networks or
 * cloud metadata endpoints (SSRF).
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const input = raw.trim();
  if (!input) throw new UserError("Please enter a URL.");

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new UserError("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UserError("Only http and https URLs are supported.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UserError("Only standard web ports (80 and 443) are allowed.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UserError("That address is not allowed.");
  }

  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new UserError("Could not find that website. Check the URL and try again.");
      });

  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new UserError("That address is not allowed.");
  }

  return url;
}
