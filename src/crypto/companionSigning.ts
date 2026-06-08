import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";
import { fromByteArray, toByteArray } from "base64-js";

export const SIGNED_COMMAND_HEADERS = {
  version: "X-Odysseus-Command-Version",
  keyId: "X-Odysseus-Command-Key-Id",
  timestamp: "X-Odysseus-Command-Timestamp",
  nonce: "X-Odysseus-Command-Nonce",
  signature: "X-Odysseus-Command-Signature",
} as const;

export const SIGNED_COMMAND_VERSION = 1;
export const DEFAULT_COMMAND_PATH = "/api/companion/commands";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CommandKeyPair = {
  keyId: string;
  publicKeyB64: string;
  privateSeedB64: string;
  fingerprint: string;
  registered: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeJson(value: unknown): JsonValue {
  if (value === undefined || value === null) return {};
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (isPlainObject(value)) {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (
        child === undefined ||
        typeof child === "function" ||
        typeof child === "symbol" ||
        typeof child === "bigint"
      ) {
        throw new TypeError("Body must be JSON-serializable");
      }
      out[key] = normalizeJson(child);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Body must be JSON-serializable");
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new TypeError("Body must be JSON-serializable");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export async function sha256Hex(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

export async function bodySha256(body: unknown): Promise<string> {
  return sha256Hex(canonicalJson(body));
}

export function bytesToBase64(bytes: Uint8Array): string {
  return fromByteArray(bytes);
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export async function generateNonce(byteLength = 16): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(byteLength);
  return bytesToBase64(bytes).replace(/=+$/g, "");
}

export async function createCommandKeyPair(): Promise<CommandKeyPair> {
  const seed = await Crypto.getRandomBytesAsync(32);
  const pair = nacl.sign.keyPair.fromSeed(seed);
  const publicKeyB64 = bytesToBase64(pair.publicKey);
  const fingerprint = (await sha256Hex(publicKeyB64)).slice(0, 16);

  return {
    keyId: `mobile-${fingerprint}`,
    publicKeyB64,
    privateSeedB64: bytesToBase64(seed),
    fingerprint,
    registered: false,
  };
}

export async function signingPayload({
  method = "POST",
  path = DEFAULT_COMMAND_PATH,
  body = {},
  keyId,
  nonce,
  timestamp,
  version = SIGNED_COMMAND_VERSION,
}: {
  method?: string;
  path?: string;
  body?: unknown;
  keyId: string;
  nonce: string;
  timestamp: string;
  version?: number;
}): Promise<string> {
  const cleanMethod = method.trim().toUpperCase();
  const cleanPath = path.trim();
  const cleanKeyId = keyId.trim();
  const cleanNonce = nonce.trim();
  const cleanTimestamp = timestamp.trim();

  if (version !== SIGNED_COMMAND_VERSION) {
    throw new Error("Unsupported signed command version");
  }
  if (!cleanMethod) throw new Error("HTTP method is required");
  if (!cleanPath.startsWith("/")) {
    throw new Error("Request path must start with /");
  }
  if (!cleanKeyId) throw new Error("Command key id is required");
  if (!cleanNonce) throw new Error("Command nonce is required");
  if (!cleanTimestamp) throw new Error("Command timestamp is required");

  return canonicalJson({
    body_sha256: await bodySha256(body),
    key_id: cleanKeyId,
    method: cleanMethod,
    nonce: cleanNonce,
    path: cleanPath,
    timestamp: cleanTimestamp,
    v: version,
  });
}

export async function signedCommandHeaders({
  body,
  key,
  method = "POST",
  path = DEFAULT_COMMAND_PATH,
  timestamp = new Date().toISOString(),
}: {
  body: unknown;
  key: CommandKeyPair;
  method?: string;
  path?: string;
  timestamp?: string;
}) {
  const seedBytes = toByteArray(key.privateSeedB64);
  const pair = nacl.sign.keyPair.fromSeed(seedBytes);
  const nonce = await generateNonce();
  const payload = await signingPayload({
    method,
    path,
    body,
    keyId: key.keyId,
    nonce,
    timestamp,
  });
  const signature = nacl.sign.detached(utf8Bytes(payload), pair.secretKey);

  return {
    [SIGNED_COMMAND_HEADERS.version]: String(SIGNED_COMMAND_VERSION),
    [SIGNED_COMMAND_HEADERS.keyId]: key.keyId,
    [SIGNED_COMMAND_HEADERS.timestamp]: timestamp,
    [SIGNED_COMMAND_HEADERS.nonce]: nonce,
    [SIGNED_COMMAND_HEADERS.signature]: bytesToBase64(signature),
  };
}
