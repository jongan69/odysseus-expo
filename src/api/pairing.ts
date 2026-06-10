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

function parseOptionalHostPort(payload: Record<string, unknown>) {
  const host = String(payload.host ?? "").trim();
  const hasPort = payload.port !== undefined && payload.port !== null && payload.port !== "";
  const port = Number(payload.port);

  if (!host && !hasPort) return {};
  if (!host) throw new Error("Pairing host is required");
  if (!hasPort) throw new Error("Pairing port is required");
  if (/[\s/\\?#]/.test(host)) throw new Error("Pairing host is invalid");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Pairing port must be an integer between 1 and 65535");
  }
  return { host, port };
}

function hostPortBaseUrl(host: string, port: number, protocol: "http" | "https" = "http") {
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `${protocol}://${normalizedHost}:${port}`;
}

export function parsePairingPayload(input: string | unknown): PairingPayload {
  const payload = typeof input === "string" ? JSON.parse(input) : input;
  if (!isPlainObject(payload)) {
    throw new Error("Pairing payload must be a JSON object");
  }
  const version = Number(payload.v);
  const baseUrl = String(payload.base_url ?? "").trim();
  const token = String(payload.token ?? "").trim();
  const hostPort = parseOptionalHostPort(payload);

  if (version !== PAIRING_VERSION) {
    throw new Error("Unsupported pairing payload version");
  }
  if (baseUrl) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (!token.startsWith("ody_")) throw new Error("Pairing token is invalid");
    return { v: version, base_url: normalizedBaseUrl, token, ...hostPort };
  }
  if (!("host" in hostPort) || !("port" in hostPort)) throw new Error("Pairing host is required");
  if (!token.startsWith("ody_")) throw new Error("Pairing token is invalid");
  return { v: version, token, ...hostPort };
}

export function companionBaseUrlCandidatesFromPairing(
  input: PairingPayload,
  protocol: "http" | "https" = "http",
) {
  const payload = parsePairingPayload(input);
  const candidates: string[] = [];
  if (payload.base_url) candidates.push(payload.base_url);
  if (payload.host && payload.port) {
    candidates.push(hostPortBaseUrl(payload.host, payload.port, protocol));
  }
  return [...new Set(candidates)];
}

export function companionBaseUrlFromPairing(
  input: PairingPayload,
  protocol: "http" | "https" = "http",
) {
  return companionBaseUrlCandidatesFromPairing(input, protocol)[0]!;
}
