const PAIRING_VERSION = 1;

export type PairingPayload = {
  v: number;
  base_url?: string;
  host?: string;
  port?: number;
  token: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function normalizeBaseUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Pairing base_url is invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Pairing base_url must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("Pairing base_url must not include credentials");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Pairing base_url must be an origin without path, query, or hash");
  }

  return url.origin;
}

export function parsePairingPayload(input: string | unknown): PairingPayload {
  const payload = typeof input === "string" ? JSON.parse(input) : input;
  if (!isPlainObject(payload)) {
    throw new Error("Pairing payload must be a JSON object");
  }
  const version = Number(payload.v);
  const baseUrl = String(payload.base_url ?? "").trim();
  const host = String(payload.host ?? "").trim();
  const hasPort = payload.port !== undefined && payload.port !== null && payload.port !== "";
  const port = Number(payload.port);
  const token = String(payload.token ?? "").trim();

  if (version !== PAIRING_VERSION) {
    throw new Error("Unsupported pairing payload version");
  }
  if (baseUrl) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (!token.startsWith("ody_")) throw new Error("Pairing token is invalid");
    return { v: version, base_url: normalizedBaseUrl, token };
  }
  if (!host) throw new Error("Pairing host is required");
  if (!hasPort) throw new Error("Pairing port is required");
  if (/[\s/\\?#]/.test(host)) throw new Error("Pairing host is invalid");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Pairing port must be an integer between 1 and 65535");
  }
  if (!token.startsWith("ody_")) throw new Error("Pairing token is invalid");
  return { v: version, host, port, token };
}

export function companionBaseUrlFromPairing(
  input: PairingPayload,
  protocol: "http" | "https" = "http",
) {
  const payload = parsePairingPayload(input);
  if (payload.base_url) return payload.base_url;
  const host =
    payload.host!.includes(":") && !payload.host!.startsWith("[")
      ? `[${payload.host}]`
      : payload.host!;
  return `${protocol}://${host}:${payload.port}`;
}
