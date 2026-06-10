import {
  OdysseusClient,
  companionBaseUrlCandidatesFromPairing,
  isInvalidApiTokenError,
  parsePairingPayload,
  type CommandDefinition,
  type CompanionEndpoint,
  type CompanionManifest,
  type CompanionSession,
  type PairingPayload,
} from "@/api/odysseusClient";
import {
  createCommandKeyPair,
  type CommandKeyPair,
  type JsonValue,
} from "@/crypto/companionSigning";
import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from "@/storage/secureCompanionStorage";
import {
  chatSessionStorageScope,
  clearChatSessionState,
  deleteChatSessionMessages,
  loadChatSessionState,
  setChatSessionArchived,
  setChatSessionDeleted,
  deleteChatSessionScope,
} from "@/storage/chatSessionStorage";
import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PAIRING_STORAGE_KEY = "odysseus.companion.pairing.v1";
const COMMAND_KEY_STORAGE_KEY = "odysseus.companion.command-key.v1";
const REMOTE_COMPANION_DISCOVERY_TIMEOUT_MS = 30000;

type StoredPairing = {
  pairing: PairingPayload;
  baseUrl: string;
  protocol: "http" | "https";
  activeSessionId?: string;
  selectedEndpointId?: string;
  selectedModel?: string;
};

type CompanionStatus = "loading" | "unpaired" | "paired" | "error";

type CompanionContextValue = {
  status: CompanionStatus;
  baseUrl?: string;
  protocol: "http" | "https";
  pairing?: PairingPayload;
  manifest?: CompanionManifest;
  endpoints: CompanionEndpoint[];
  sessions: CompanionSession[];
  activeSessionId?: string;
  activeSession?: CompanionSession;
  selectedEndpointId?: string;
  selectedModel?: string;
  selectedEndpoint?: CompanionEndpoint;
  commandKey?: CommandKeyPair;
  commandCatalog: CommandDefinition[];
  tokenScopes: string[];
  canChat: boolean;
  canUseCommands: boolean;
  isInsecureTransport: boolean;
  error?: string;
  client?: OdysseusClient;
  pairFromPayload: (payloadText: string, protocol?: "http" | "https") => Promise<void>;
  refresh: () => Promise<void>;
  resetPairing: () => Promise<void>;
  createSession: (input: {
    name?: string;
    endpointId?: string;
    model?: string;
    rag?: boolean;
  }) => Promise<CompanionSession>;
  setActiveSessionId: (sessionId: string) => Promise<void>;
  setSelectedModel: (endpointId?: string, model?: string) => Promise<void>;
  ensureCommandKeyRegistered: () => Promise<CommandKeyPair>;
  revokeCommandKey: () => Promise<void>;
  sendCommand: (
    command: string,
    args?: Record<string, JsonValue>,
  ) => Promise<Record<string, unknown>>;
  archiveSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  forgetAll: () => Promise<void>;
};

const CompanionContext = createContext<CompanionContextValue | null>(null);

function commandCatalogFromManifest(manifest?: CompanionManifest) {
  const commands = manifest?.features?.signed_commands?.commands;
  if (Array.isArray(commands) && commands.length) return commands;
  return [
    {
      name: "capabilities",
      description: "Return the fixed read-only command list and safety flags.",
      mode: "read_only",
      mutating: false,
      args_schema: { type: "object", additionalProperties: false, properties: {} },
    },
    {
      name: "server_status",
      description: "Return server, version, owner, time, and platform status.",
      mode: "read_only",
      mutating: false,
      args_schema: { type: "object", additionalProperties: false, properties: {} },
    },
    {
      name: "workspace_status",
      description: "Return current process workspace and git summary.",
      mode: "read_only",
      mutating: false,
      args_schema: { type: "object", additionalProperties: false, properties: {} },
    },
    {
      name: "git_status",
      description: "Return the git summary only.",
      mode: "read_only",
      mutating: false,
      args_schema: { type: "object", additionalProperties: false, properties: {} },
    },
  ] satisfies CommandDefinition[];
}

function parseStoredPairing(value: string | null): StoredPairing | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredPairing;
    if (!parsed?.baseUrl || !parsed?.pairing) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseStoredCommandKey(value: string | null): CommandKeyPair | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as CommandKeyPair;
    if (!parsed.keyId || !parsed.privateSeedB64 || !parsed.publicKeyB64) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function connectionErrorMessage(
  baseUrl: string | undefined,
  err: unknown,
  context: "refresh" | "pairing" = "refresh",
) {
  const detail = err instanceof Error ? err.message : "Unable to reach Odysseus";
  const target = baseUrl ?? "the paired Odysseus server";
  const networkHint =
    "If this is a local HTTP pairing, your iPhone must be on the same Wi-Fi or VPN as the machine running Odysseus. For off-network use, pair again with a reachable HTTPS tunnel or public Odysseus origin.";

  if (isInvalidApiTokenError(err)) {
    if (context === "pairing") {
      return `The scanned Odysseus token was rejected by ${target}. Your previous pairing is still active on this device. Scan a fresh code from that exact Odysseus URL, then register the command key again.`;
    }
    return `The paired Odysseus token was rejected by ${target}. Pair again from that same Tailscale or remote Odysseus URL, then register the command key again.`;
  }

  if (
    /timed out|could not reach|network request failed|request has been canceled|request has been cancelled/i.test(
      detail,
    )
  ) {
    return `Unable to reach ${target}. ${networkHint}`;
  }

  return detail;
}

function isReachabilityError(err: unknown) {
  const detail = err instanceof Error ? err.message : String(err ?? "");
  return /timed out|could not reach|network request failed|request has been canceled|request has been cancelled/i.test(
    detail,
  );
}

type CompanionSnapshot = {
  manifest: CompanionManifest;
  endpoints: CompanionEndpoint[];
  sessions: CompanionSession[];
};

async function fetchCompanionSnapshot(client: OdysseusClient): Promise<CompanionSnapshot> {
  const requestInit = client.baseUrl.startsWith("https:")
    ? { timeoutMs: REMOTE_COMPANION_DISCOVERY_TIMEOUT_MS }
    : {};
  const manifest = await client.manifest(requestInit);
  const [models, sessions] = await Promise.all([
    client.models(requestInit),
    client.sessions(requestInit),
  ]);
  return {
    manifest,
    endpoints: models.endpoints ?? [],
    sessions: sessions.sessions ?? [],
  };
}

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<CompanionStatus>("loading");
  const [stored, setStored] = useState<StoredPairing | null>(null);
  const [manifest, setManifest] = useState<CompanionManifest>();
  const [endpoints, setEndpoints] = useState<CompanionEndpoint[]>([]);
  const [sessions, setSessions] = useState<CompanionSession[]>([]);
  const [archivedSessionIds, setArchivedSessionIds] = useState<string[]>([]);
  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>([]);
  const [commandKey, setCommandKey] = useState<CommandKeyPair>();
  const [error, setError] = useState<string>();
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const storageScope = useMemo(
    () =>
      stored
        ? chatSessionStorageScope({
            baseUrl: stored.baseUrl,
            token: stored.pairing.token,
          })
        : undefined,
    [stored],
  );

  const archivedSessionSet = useMemo(
    () => new Set(archivedSessionIds),
    [archivedSessionIds],
  );
  const deletedSessionSet = useMemo(
    () => new Set(deletedSessionIds),
    [deletedSessionIds],
  );

  const visibleSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          !archivedSessionSet.has(session.id) &&
          !deletedSessionSet.has(session.id),
      ),
    [sessions, archivedSessionSet, deletedSessionSet],
  );

  const resolvedActiveSessionId = useMemo(() => {
    if (
      stored?.activeSessionId &&
      !archivedSessionSet.has(stored.activeSessionId) &&
      !deletedSessionSet.has(stored.activeSessionId)
    ) {
      return stored.activeSessionId;
    }
    return visibleSessions[0]?.id;
  }, [stored, archivedSessionSet, deletedSessionSet, visibleSessions]);

  const client = useMemo(() => {
    if (!stored) return undefined;
    return new OdysseusClient(stored.baseUrl, stored.pairing.token);
  }, [stored]);

  const applySnapshot = useCallback((snapshot: CompanionSnapshot) => {
    setManifest(snapshot.manifest);
    setEndpoints(snapshot.endpoints);
    setSessions(snapshot.sessions);
    setStatus("paired");
  }, []);

  const refresh = useCallback(async () => {
    if (!client) return;
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refreshPromise = (async () => {
      try {
        applySnapshot(await fetchCompanionSnapshot(client));
        setError(undefined);
      } catch (err) {
        setStatus("error");
        setError(connectionErrorMessage(stored?.baseUrl, err));
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [applySnapshot, client, stored?.baseUrl]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const [pairingValue, keyValue] = await Promise.all([
        getSecureItem(PAIRING_STORAGE_KEY),
        getSecureItem(COMMAND_KEY_STORAGE_KEY),
      ]);
      if (cancelled) return;
      const nextStored = parseStoredPairing(pairingValue);
      setStored(nextStored);
      setCommandKey(parseStoredCommandKey(keyValue));
      setStatus(nextStored ? "paired" : "unpaired");
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === "paired" && client && !manifest) {
      const timer = setTimeout(() => {
        refresh();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [client, manifest, refresh, status]);

  useEffect(() => {
    if (!client || !stored) return;
    const interval = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [client, refresh, stored]);

  const persistStored = useCallback(async (nextStored: StoredPairing) => {
    setStored(nextStored);
    await setSecureItem(PAIRING_STORAGE_KEY, JSON.stringify(nextStored));
  }, []);

  useEffect(() => {
    const scope = storageScope;
    if (!scope) {
      const timeout = setTimeout(() => {
        setArchivedSessionIds([]);
        setDeletedSessionIds([]);
      }, 0);
      return () => clearTimeout(timeout);
    }
    let cancelled = false;
    async function hydrateSessionState() {
      const nextState = await loadChatSessionState(scope!);
      if (cancelled) return;
      setArchivedSessionIds(nextState.archivedSessions);
      setDeletedSessionIds(nextState.deletedSessions);
    }
    void hydrateSessionState();
    return () => {
      cancelled = true;
    };
  }, [storageScope]);

  const pairFromPayload = useCallback(
    async (payloadText: string, protocol: "http" | "https" = "http") => {
      const pairing = parsePairingPayload(payloadText);
      setError(undefined);
      const candidateBaseUrls = companionBaseUrlCandidatesFromPairing(pairing, protocol);
      try {
        let lastError: unknown;
        for (const baseUrl of candidateBaseUrls) {
          try {
            const snapshot = await fetchCompanionSnapshot(
              new OdysseusClient(baseUrl, pairing.token),
            );
            const nextProtocol = baseUrl.startsWith("https:") ? "https" : "http";
            const nextStored = {
              pairing,
              baseUrl,
              protocol: nextProtocol,
            } satisfies StoredPairing;
            await deleteSecureItem(COMMAND_KEY_STORAGE_KEY);
            setCommandKey(undefined);
            await persistStored(nextStored);
            applySnapshot(snapshot);
            return;
          } catch (err) {
            lastError = err;
            if (!isReachabilityError(err) || baseUrl === candidateBaseUrls.at(-1)) {
              throw err;
            }
          }
        }
        throw lastError;
      } catch (err) {
        const message = connectionErrorMessage(candidateBaseUrls.at(-1), err, "pairing");
        setError(message);
        throw new Error(message);
      }
    },
    [applySnapshot, persistStored],
  );

  const selectedEndpoint = useMemo(
    () =>
      endpoints.find((endpoint) => endpoint.endpoint_id === stored?.selectedEndpointId) ??
      endpoints[0],
    [endpoints, stored?.selectedEndpointId],
  );
  const selectedModel = useMemo(() => {
    const preferred = stored?.selectedModel;
    if (preferred && selectedEndpoint?.models?.includes(preferred)) return preferred;
    return selectedEndpoint?.models?.[0];
  }, [selectedEndpoint, stored?.selectedModel]);

  const createSession = useCallback(
    async (input: {
      name?: string;
      endpointId?: string;
      model?: string;
      rag?: boolean;
    }) => {
      if (!client || !stored) throw new Error("Pair with Odysseus first");
      const endpointId = input.endpointId ?? selectedEndpoint?.endpoint_id;
      const model = input.model ?? selectedModel;
      const result = await client.createSession({
        ...input,
        endpointId,
        model,
      });
      const nextSessions = [result.session, ...sessions.filter((s) => s.id !== result.session.id)];
      setSessions(nextSessions);
      const nextStored = {
        ...stored,
        activeSessionId: result.session.id,
        selectedEndpointId: endpointId ?? stored.selectedEndpointId,
        selectedModel: model ?? stored.selectedModel,
      };
      await persistStored(nextStored);
      return result.session;
    },
    [client, persistStored, selectedEndpoint?.endpoint_id, selectedModel, sessions, stored],
  );

  const setActiveSessionId = useCallback(
    async (sessionId: string) => {
      if (!stored) return;
      if (archivedSessionSet.has(sessionId) || deletedSessionSet.has(sessionId)) return;
      await persistStored({ ...stored, activeSessionId: sessionId });
    },
    [archivedSessionSet, deletedSessionSet, persistStored, stored],
  );

  const setSelectedModel = useCallback(
    async (endpointId?: string, model?: string) => {
      if (!stored) return;
      await persistStored({
        ...stored,
        selectedEndpointId: endpointId,
        selectedModel: model,
      });
    },
    [persistStored, stored],
  );

  const ensureCommandKeyRegistered = useCallback(async () => {
    if (!client) throw new Error("Pair with Odysseus first");
    let nextKey = commandKey ?? (await createCommandKeyPair());
    if (!nextKey.registered) {
      try {
        await client.registerKey({
          publicKeyB64: nextKey.publicKeyB64,
          keyId: nextKey.keyId,
          label: "Odysseus mobile companion",
        });
      } catch (err) {
        const message = connectionErrorMessage(stored?.baseUrl, err);
        setStatus("error");
        setError(message);
        throw new Error(message);
      }
      nextKey = { ...nextKey, registered: true };
    }
    setCommandKey(nextKey);
    await setSecureItem(COMMAND_KEY_STORAGE_KEY, JSON.stringify(nextKey));
    return nextKey;
  }, [client, commandKey, stored?.baseUrl]);

  const revokeCommandKey = useCallback(async () => {
    if (client && commandKey?.registered) {
      await client.revokeKey(commandKey.keyId);
    }
    setCommandKey(undefined);
    await deleteSecureItem(COMMAND_KEY_STORAGE_KEY);
  }, [client, commandKey]);

  const sendCommand = useCallback(
    async (command: string, args: Record<string, JsonValue> = {}) => {
      if (!client) throw new Error("Pair with Odysseus first");
      const key = await ensureCommandKeyRegistered();
      try {
        return await client.command(command, args, key);
      } catch (err) {
        const message = connectionErrorMessage(stored?.baseUrl, err);
        setStatus("error");
        setError(message);
        throw new Error(message);
      }
    },
    [client, ensureCommandKeyRegistered, stored?.baseUrl],
  );

  const archiveSession = useCallback(
    async (sessionId: string) => {
      if (!stored || !storageScope) return;
      await setChatSessionArchived(storageScope, sessionId, true);
      setArchivedSessionIds((prev) => {
        const next = new Set(prev);
        next.add(sessionId);
        return Array.from(next);
      });
      setDeletedSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return Array.from(next);
      });
    },
    [storageScope, stored],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!stored || !storageScope) return;
      await Promise.all([
        deleteChatSessionMessages(storageScope, sessionId),
        setChatSessionDeleted(storageScope, sessionId, true),
      ]);
      setDeletedSessionIds((prev) => {
        const next = new Set(prev);
        next.add(sessionId);
        return Array.from(next);
      });
      setArchivedSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return Array.from(next);
      });
    },
    [storageScope, stored],
  );

  const forgetAll = useCallback(async () => {
    const currentScope = stored
      ? chatSessionStorageScope({
          baseUrl: stored.baseUrl,
          token: stored.pairing.token,
        })
      : undefined;
    try {
      if (client && commandKey?.registered) {
        await client.revokeKey(commandKey.keyId);
      }
    } catch {
      // Local forgetting must always work, even if the server is offline.
    }
    await Promise.all([
      deleteSecureItem(PAIRING_STORAGE_KEY),
      deleteSecureItem(COMMAND_KEY_STORAGE_KEY),
      currentScope ? deleteChatSessionScope(currentScope) : Promise.resolve(),
      currentScope ? clearChatSessionState(currentScope) : Promise.resolve(),
    ]);
    setStored(null);
    setManifest(undefined);
    setEndpoints([]);
    setSessions([]);
    setArchivedSessionIds([]);
    setDeletedSessionIds([]);
    setCommandKey(undefined);
    setError(undefined);
    setStatus("unpaired");
  }, [client, commandKey, stored]);

  const resetPairing = useCallback(async () => {
    await Promise.all([
      deleteSecureItem(PAIRING_STORAGE_KEY),
      deleteSecureItem(COMMAND_KEY_STORAGE_KEY),
    ]);
    setStored(null);
    setManifest(undefined);
    setEndpoints([]);
    setSessions([]);
    setArchivedSessionIds([]);
    setDeletedSessionIds([]);
    setCommandKey(undefined);
    setError(undefined);
    setStatus("unpaired");
  }, []);

  const activeSession = visibleSessions.find(
    (session) => session.id === resolvedActiveSessionId,
  );
  const tokenScopes = useMemo(
    () => manifest?.auth?.token_scopes ?? [],
    [manifest?.auth?.token_scopes],
  );
  const requiredChatScope =
    manifest?.auth?.required_bearer_scope ??
    manifest?.features?.chat?.required_bearer_scope ??
    "chat";
  const canChat =
    manifest?.features?.chat?.available !== false &&
    (manifest?.auth?.mode === "session" || tokenScopes.includes(requiredChatScope));
  const canUseCommands =
    tokenScopes.includes(manifest?.auth?.required_command_scope || "remote_development") ||
    manifest?.auth?.mode === "session";
  const commandCatalog = commandCatalogFromManifest(manifest);

  const value = useMemo<CompanionContextValue>(
    () => ({
      status,
      baseUrl: stored?.baseUrl,
      protocol: stored?.protocol ?? "http",
      pairing: stored?.pairing,
      manifest,
      endpoints,
      sessions: visibleSessions,
      activeSessionId: resolvedActiveSessionId,
      activeSession,
      selectedEndpointId: stored?.selectedEndpointId,
      selectedModel,
      selectedEndpoint,
      commandKey,
      commandCatalog,
      tokenScopes,
      canChat,
      canUseCommands,
      isInsecureTransport: !!stored && stored.protocol !== "https",
      error,
      client,
      pairFromPayload,
      refresh,
      resetPairing,
      createSession,
      setActiveSessionId,
      setSelectedModel,
      ensureCommandKeyRegistered,
      revokeCommandKey,
      sendCommand,
      archiveSession,
      deleteSession,
      forgetAll,
    }),
    [
      activeSession,
      canChat,
      canUseCommands,
      client,
      commandCatalog,
      commandKey,
      createSession,
      endpoints,
      ensureCommandKeyRegistered,
      error,
      forgetAll,
      manifest,
      pairFromPayload,
      refresh,
      resetPairing,
      archiveSession,
      deleteSession,
      revokeCommandKey,
      selectedEndpoint,
      selectedModel,
      sendCommand,
      visibleSessions,
      resolvedActiveSessionId,
      stored,
      setActiveSessionId,
      setSelectedModel,
      status,
      tokenScopes,
    ],
  );

  return <CompanionContext value={value}>{children}</CompanionContext>;
}

export function useCompanion() {
  const context = use(CompanionContext);
  if (!context) {
    throw new Error("useCompanion must be used within CompanionProvider");
  }
  return context;
}
