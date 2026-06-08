import * as FileSystem from "expo-file-system/legacy";

import type { ChatMessage } from "@/components/chat/types";

const STORAGE_VERSION = 1;
const STORAGE_ROOT = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}odysseus-chat-sessions/`
  : undefined;
const INDEX_PATH = STORAGE_ROOT ? `${STORAGE_ROOT}index.v1.json` : undefined;

type StoredSession = {
  version: typeof STORAGE_VERSION;
  updatedAt: string;
  messages: ChatMessage[];
};

type StoredIndexEntry = {
  path: string;
  scope: string;
  sessionId: string;
  updatedAt: string;
};

type StoredIndex = {
  version: typeof STORAGE_VERSION;
  entries: StoredIndexEntry[];
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as ChatMessage;
  return (
    typeof candidate.id === "string" &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}

function emptyIndex(): StoredIndex {
  return { version: STORAGE_VERSION, entries: [] };
}

function sessionStoragePath(scope: string, sessionId: string) {
  if (!STORAGE_ROOT) return undefined;
  return `${STORAGE_ROOT}${scope}.${hashString(sessionId)}.json`;
}

async function ensureStorageRoot() {
  if (!STORAGE_ROOT) return false;
  const directory = await FileSystem.getInfoAsync(STORAGE_ROOT);
  if (!directory.exists) {
    await FileSystem.makeDirectoryAsync(STORAGE_ROOT, { intermediates: true });
  }
  return true;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
}

async function loadIndex(): Promise<StoredIndex> {
  if (!INDEX_PATH || !(await ensureStorageRoot())) return emptyIndex();
  const parsed = await readJson<StoredIndex>(INDEX_PATH, emptyIndex());
  if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.entries)) {
    return emptyIndex();
  }
  return parsed;
}

async function saveIndex(entry: StoredIndexEntry) {
  if (!INDEX_PATH) return;
  const index = await loadIndex();
  const entries = [
    entry,
    ...index.entries.filter((item) => item.path !== entry.path),
  ];
  await writeJson(INDEX_PATH, {
    version: STORAGE_VERSION,
    entries,
  } satisfies StoredIndex);
}

export function chatSessionStorageScope({
  baseUrl,
  token,
}: {
  baseUrl?: string;
  token?: string;
}) {
  return `${hashString(baseUrl ?? "unpaired")}.${hashString(token ?? "anonymous")}`;
}

export async function loadChatSessionMessages(scope: string, sessionId: string) {
  if (!(await ensureStorageRoot())) return [];
  const path = sessionStoragePath(scope, sessionId);
  if (!path) return [];
  const parsed = await readJson<StoredSession>(
    path,
    {
      version: STORAGE_VERSION,
      updatedAt: "",
      messages: [],
    },
  );
  if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.messages)) {
    return [];
  }
  return parsed.messages.filter(isChatMessage);
}

export async function saveChatSessionMessages(
  scope: string,
  sessionId: string,
  messages: ChatMessage[],
) {
  if (!(await ensureStorageRoot())) return;
  const path = sessionStoragePath(scope, sessionId);
  if (!path) return;
  const updatedAt = new Date().toISOString();
  const payload = {
    version: STORAGE_VERSION,
    updatedAt,
    messages: messages.filter(isChatMessage),
  } satisfies StoredSession;
  await writeJson(path, payload);
  await saveIndex({ path, scope, sessionId, updatedAt });
}

export async function deleteChatSessionScope(scope: string) {
  if (!INDEX_PATH || !(await ensureStorageRoot())) return;
  const index = await loadIndex();
  const scopedEntries = index.entries.filter((entry) => entry.scope === scope);
  await Promise.all(
    scopedEntries.map((entry) =>
      FileSystem.deleteAsync(entry.path, { idempotent: true }),
    ),
  );
  await writeJson(INDEX_PATH, {
    version: STORAGE_VERSION,
    entries: index.entries.filter((entry) => entry.scope !== scope),
  } satisfies StoredIndex);
}
