import * as FileSystem from "expo-file-system/legacy";

import type { ChatMessage } from "@/components/chat/types";

const STORAGE_VERSION = 1;
const STORAGE_ROOT = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}odysseus-chat-sessions/`
  : undefined;
const INDEX_PATH = STORAGE_ROOT ? `${STORAGE_ROOT}index.v1.json` : undefined;
const STATE_PATH_PREFIX = STORAGE_ROOT
  ? `${STORAGE_ROOT}session-state.`
  : undefined;

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

type StoredSessionState = {
  version: typeof STORAGE_VERSION;
  archivedSessions: string[];
  deletedSessions: string[];
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

function emptyState(): StoredSessionState {
  return {
    version: STORAGE_VERSION,
    archivedSessions: [],
    deletedSessions: [],
  };
}

function sessionStoragePath(scope: string, sessionId: string) {
  if (!STORAGE_ROOT) return undefined;
  return `${STORAGE_ROOT}${scope}.${hashString(sessionId)}.json`;
}

function sessionStatePath(scope: string) {
  if (!STATE_PATH_PREFIX) return undefined;
  return `${STATE_PATH_PREFIX}${scope}.json`;
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

async function writeIndex(entries: StoredIndexEntry[]) {
  if (!INDEX_PATH) return;
  await writeJson(INDEX_PATH, {
    version: STORAGE_VERSION,
    entries,
  } satisfies StoredIndex);
}

function normalizeSessionIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => !!entry))];
}

function normalizeSessionState(parsed: StoredSessionState): StoredSessionState {
  return {
    version: STORAGE_VERSION,
    archivedSessions: normalizeSessionIdList(parsed.archivedSessions),
    deletedSessions: normalizeSessionIdList(parsed.deletedSessions),
  };
}

async function loadSessionState(scope: string): Promise<StoredSessionState> {
  const statePath = sessionStatePath(scope);
  if (!statePath || !(await ensureStorageRoot())) return emptyState();
  const parsed = await readJson<StoredSessionState>(statePath, emptyState());
  if (parsed.version !== STORAGE_VERSION) return emptyState();
  return normalizeSessionState(parsed);
}

async function writeSessionState(scope: string, state: StoredSessionState) {
  const statePath = sessionStatePath(scope);
  if (!statePath) return;
  await writeJson(statePath, normalizeSessionState(state));
}

async function updateSessionState(
  scope: string,
  update: (state: StoredSessionState) => StoredSessionState,
) {
  if (!(await ensureStorageRoot())) return;
  const next = update(await loadSessionState(scope));
  await writeSessionState(scope, next);
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
  const index = await loadIndex();
  await writeIndex([
    {
      path,
      scope,
      sessionId,
      updatedAt,
    },
    ...index.entries.filter(
      (item) => !(item.scope === scope && item.sessionId === sessionId),
    ),
  ]);
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
  await writeIndex(index.entries.filter((entry) => entry.scope !== scope));
}

export async function deleteChatSessionMessages(scope: string, sessionId: string) {
  if (!INDEX_PATH || !(await ensureStorageRoot())) return;
  const path = sessionStoragePath(scope, sessionId);
  if (path) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
  const index = await loadIndex();
  await writeIndex(
    index.entries.filter(
      (entry) => !(entry.scope === scope && entry.sessionId === sessionId),
    ),
  );
}

export async function loadChatSessionState(scope: string) {
  return loadSessionState(scope);
}

export async function setChatSessionArchived(
  scope: string,
  sessionId: string,
  archived: boolean,
) {
  await updateSessionState(scope, (state) => {
    const archivedSessions = new Set(state.archivedSessions);
    const deletedSessions = new Set(state.deletedSessions);

    if (archived) {
      archivedSessions.add(sessionId);
      deletedSessions.delete(sessionId);
    } else {
      archivedSessions.delete(sessionId);
    }

    return {
      ...state,
      archivedSessions: [...archivedSessions],
      deletedSessions: [...deletedSessions],
    };
  });
}

export async function setChatSessionDeleted(
  scope: string,
  sessionId: string,
  deleted: boolean,
) {
  await updateSessionState(scope, (state) => {
    const archivedSessions = new Set(state.archivedSessions);
    const deletedSessions = new Set(state.deletedSessions);

    if (deleted) {
      deletedSessions.add(sessionId);
      archivedSessions.delete(sessionId);
    } else {
      deletedSessions.delete(sessionId);
    }

    return {
      ...state,
      archivedSessions: [...archivedSessions],
      deletedSessions: [...deletedSessions],
    };
  });
}

export async function clearChatSessionState(scope: string) {
  const statePath = sessionStatePath(scope);
  if (!statePath || !(await ensureStorageRoot())) return;
  await FileSystem.deleteAsync(statePath, { idempotent: true });
}
