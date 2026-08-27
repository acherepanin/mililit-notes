import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { BadRequestException, Injectable } from "@nestjs/common";

function normalizedHost(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && [0, 2, 168].includes(second)) ||
    (first === 198 && [18, 19, 51].includes(second)) ||
    (first === 203 && second === 0) ||
    first >= 224
  );
}

function isBlockedAddress(value: string): boolean {
  const address = normalizedHost(value);
  if (isIP(address) === 4) return isBlockedIpv4(address);
  if (isIP(address) !== 6) return true;
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    return isBlockedIpv4(lower.slice("::ffff:".length));
  }
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith("2001:db8:")
  );
}

function isBlockedHostname(hostname: string): boolean {
  const host = normalizedHost(hostname);
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    host === "metadata.google.internal" ||
    host === "metadata.azure.internal"
  );
}

function parseEndpoint(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BadRequestException("AI provider URL must be valid");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new BadRequestException(
      "AI provider URL cannot contain credentials, query, or fragment",
    );
  }
  return url;
}

function canonicalEndpoint(url: URL): string {
  return url.href.replace(/\/+$/, "");
}

@Injectable()
export class ProviderEndpointPolicyService {
  normalize(value: string): string {
    const url = parseEndpoint(value);
    const normalized = canonicalEndpoint(url);
    if (this.isExplicitlyAllowed(normalized)) return normalized;
    if (url.protocol !== "https:") {
      throw new BadRequestException("AI provider URL must use HTTPS");
    }
    if (isBlockedHostname(url.hostname)) {
      throw new BadRequestException("AI provider host is not allowed");
    }
    const host = normalizedHost(url.hostname);
    if (isIP(host) && isBlockedAddress(host)) {
      throw new BadRequestException("AI provider address is not public");
    }
    return normalized;
  }

  async assertAllowedForRequest(value: string): Promise<string> {
    const normalized = this.normalize(value);
    if (this.isExplicitlyAllowed(normalized)) return normalized;
    const url = new URL(normalized);
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (
      addresses.length === 0 ||
      addresses.some((entry) => isBlockedAddress(entry.address))
    ) {
      throw new BadRequestException(
        "AI provider host resolves to a non-public address",
      );
    }
    return normalized;
  }

  private isExplicitlyAllowed(value: string): boolean {
    return (process.env.AI_PROVIDER_ENDPOINT_ALLOWLIST ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .some((entry) => {
        try {
          return canonicalEndpoint(parseEndpoint(entry)) === value;
        } catch {
          return false;
        }
      });
  }
}
