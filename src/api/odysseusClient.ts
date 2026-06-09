import type { CommandKeyPair, JsonValue } from "@/crypto/companionSigning";

export {
  companionBaseUrlFromPairing,
  normalizeBaseUrl,
  parsePairingPayload,
  type PairingPayload,
} from "./pairing";

const DEFAULT_COMMAND_PATH = "/api/companion/commands";
const DEFAULT_JSON_REQUEST_TIMEOUT_MS = 10000;

const STREAM_NOT_ACTIVE_ERROR_PATH_PREFIXES = [
  "/api/chat/resume/",
  "/api/chat/stream_status/",
];
const INVALID_API_TOKEN_PATTERN = /invalid api token/i;

export class OdysseusApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly body: string = "",
  ) {
    super(`${path} failed: ${status}${body ? ` ${body}` : ""}`);
    this.name = "OdysseusApiError";
  }
}

export function isChatStreamInactiveError(error: unknown): error is OdysseusApiError {
  return (
    error instanceof OdysseusApiError &&
    error.status === 404 &&
    STREAM_NOT_ACTIVE_ERROR_PATH_PREFIXES.some((prefix) =>
      error.path.startsWith(prefix),
    )
  );
}

export function isInvalidApiTokenError(error: unknown): error is OdysseusApiError {
  return (
    error instanceof OdysseusApiError &&
    error.status === 401 &&
    INVALID_API_TOKEN_PATTERN.test(`${error.body} ${error.message}`)
  );
}

export type CompanionEndpoint = {
  endpoint_id: string;
  name: string;
  endpoint_url: string;
  models: string[];
  supports_tools?: boolean;
};

export type CompanionSession = {
  id: string;
  name: string;
  model: string;
  endpoint_url?: string;
  rag: boolean;
  archived: boolean;
  message_count: number;
};

export type CompanionHistoryMessage = {
  role?: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
};

export type CommandDefinition = {
  name: string;
  description?: string;
  mode?: string;
  mutating?: boolean;
  requires_admin?: boolean;
  raw_shell?: boolean;
  allowed_checks?: string[];
  args_schema?: {
    type?: string;
    required?: string[];
    properties?: Record<
      string,
      {
        type?: string;
        enum?: string[];
        minimum?: number;
        maximum?: number;
        items?: { type?: string };
      }
    >;
    additionalProperties?: boolean;
  };
};

export type CompanionManifest = {
  name: string;
  version: string;
  contract_version: number;
  owner?: string | null;
  auth?: {
    mode?: string;
    required_bearer_scope?: string;
    required_command_scope?: string;
    token_scopes?: string[];
  };
  transport?: {
    private_network_required?: boolean;
    public_internet_supported?: boolean;
    recommended?: string[];
  };
  endpoints?: Record<string, { method: string; path: string }>;
  features?: {
    chat?: {
      available?: boolean;
      streaming?: boolean;
      required_bearer_scope?: string;
      stream_path?: string;
      resume_path?: string;
      stop_path?: string;
      status_path?: string;
    };
    signed_commands?: {
      status?: string;
      protocol_version?: number;
      algorithm?: string;
      headers?: Record<string, string>;
      commands?: CommandDefinition[];
      allowed_commands?: string[];
      raw_shell_enabled?: boolean;
      key_registry?: {
        status?: string;
        register_path?: string;
        revoke_path?: string;
      };
    };
    remote_development?: {
      status?: string;
      raw_shell_enabled?: boolean;
      workspace_file_control_enabled?: boolean;
      requires_signed_commands?: boolean;
    };
    goal_runs?: {
      status?: string;
      available?: boolean;
      required_bearer_scope?: string;
      requires_session_id?: boolean;
      start_path?: string;
      list_path?: string;
      status_path?: string;
      resume_path?: string;
      stop_path?: string;
      completion_markers?: string[];
    };
  };
};

export type CompanionGoalRunStatus =
  | "queued"
  | "running"
  | "continuing"
  | "paused"
  | "complete"
  | "blocked"
  | "error"
  | "stopped";

export type CompanionGoalTurn = {
  id: string;
  round: number;
  prompt?: string;
  response?: string;
  status?: "complete" | "continue" | "blocked" | null;
  started_at?: string;
  completed_at?: string | null;
};

export type CompanionGoalRun = {
  version?: number;
  id: string;
  goal: string;
  session_id: string;
  status: CompanionGoalRunStatus;
  round: number;
  started_at: string;
  updated_at: string;
  completed_at?: string | null;
  error?: string | null;
  use_web?: boolean;
  allow_bash?: boolean;
  max_turns?: number;
  transcript?: CompanionGoalTurn[];
  live_text?: string;
  last_metrics?: Record<string, unknown>;
};

export type ChatStreamEvent =
  | { type: "done" }
  | { type: "delta"; text: string; thinking?: boolean }
  | { type: "model_info"; data: Record<string, unknown> }
  | { type: "model_actual"; data: Record<string, unknown> }
  | { type: "fallback"; data: Record<string, unknown> }
  | { type: "metrics"; data: Record<string, unknown> }
  | { type: "message_saved"; id?: string }
  | { type: "tool_start"; data: Record<string, unknown> }
  | { type: "tool_progress"; data: Record<string, unknown> }
  | { type: "tool_output"; data: Record<string, unknown> }
  | { type: "agent_step"; data: Record<string, unknown> }
  | { type: "web_sources"; data: unknown }
  | { type: "research"; eventType: string; data: unknown }
  | { type: "event"; eventType: string; data: Record<string, unknown> }
  | { type: "error"; error: string; status?: number };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/g, "")}${path}`;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token.trim()}` };
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  token: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { headers, signal, timeoutMs = DEFAULT_JSON_REQUEST_TIMEOUT_MS, ...requestInit } = init;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const abortRequest = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abortRequest, { once: true });
  }

  if (timeoutMs > 0) {
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(joinUrl(baseUrl, path), {
      ...requestInit,
      signal: controller.signal,
      headers: {
        ...(headers ?? {}),
        ...authHeaders(token),
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OdysseusApiError(path, response.status, text);
    }
    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `${path} timed out after ${Math.round(timeoutMs / 1000)}s while connecting to ${baseUrl}`,
      );
    }
    if (err instanceof TypeError) {
      throw new Error(`${path} could not reach ${baseUrl}`);
    }
    throw err;
  } finally {
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
}

export function chatEventFromJson(json: Record<string, unknown>): ChatStreamEvent {
  if (typeof json.delta === "string") {
    return { type: "delta", text: json.delta, thinking: json.thinking === true };
  }
  const eventType = String(json.type || "event");
  if (eventType === "model_info") return { type: "model_info", data: json };
  if (eventType === "model_actual") return { type: "model_actual", data: json };
  if (eventType === "fallback") return { type: "fallback", data: json };
  if (eventType === "metrics" && isPlainObject(json.data)) {
    return { type: "metrics", data: json.data };
  }
  if (eventType === "message_saved") {
    return { type: "message_saved", id: String(json.id || "") || undefined };
  }
  if (eventType === "tool_start") return { type: "tool_start", data: json };
  if (eventType === "tool_progress") return { type: "tool_progress", data: json };
  if (eventType === "tool_output") return { type: "tool_output", data: json };
  if (eventType === "agent_step") return { type: "agent_step", data: json };
  if (eventType === "web_sources") {
    return { type: "web_sources", data: json.data ?? json };
  }
  if (eventType.startsWith("research_")) {
    return { type: "research", eventType, data: json.data ?? json };
  }
  return { type: "event", eventType, data: json };
}

function parseSseBlock(block: string): { event?: string; data: string } | null {
  const lines = block.split(/\r?\n/);
  const data: string[] = [];
  let event: string | undefined;

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }

  if (!data.length && !event) return null;
  return { event, data: data.join("\n") };
}

function emitSseBlock(block: string, onEvent: (event: ChatStreamEvent) => void) {
  const parsed = parseSseBlock(block);
  if (!parsed) return;
  if (parsed.data === "[DONE]") {
    onEvent({ type: "done" });
    return;
  }
  if (!parsed.data) return;
  try {
    const json = JSON.parse(parsed.data);
    if (parsed.event === "error") {
      onEvent({
        type: "error",
        error: String(json.error || json.detail || parsed.data),
        status: typeof json.status === "number" ? json.status : undefined,
      });
      return;
    }
    if (isPlainObject(json)) onEvent(chatEventFromJson(json));
  } catch {
    if (parsed.event === "error") {
      onEvent({ type: "error", error: parsed.data });
    }
  }
}

export async function readSseResponse(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void,
) {
  if (response.body && "getReader" in response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) emitSseBlock(block, onEvent);
    }

    buffer += decoder.decode();
    if (buffer.trim()) emitSseBlock(buffer, onEvent);
    return;
  }

  const text = await response.text();
  for (const block of text.split(/\r?\n\r?\n/)) emitSseBlock(block, onEvent);
}

function appendFormField(formData: FormData, key: string, value: unknown) {
  if (value === undefined || value === null || value === false || value === "") {
    return;
  }
  if (value === true) {
    formData.append(key, "true");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length) formData.append(key, JSON.stringify(value));
    return;
  }
  formData.append(key, String(value));
}

export class OdysseusClient {
  readonly baseUrl: string;
  readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token.trim();
  }

  manifest() {
    return requestJson<CompanionManifest>(
      this.baseUrl,
      "/api/companion/manifest",
      this.token,
    );
  }

  models() {
    return requestJson<{ endpoints: CompanionEndpoint[] }>(
      this.baseUrl,
      "/api/companion/models",
      this.token,
    );
  }

  sessions() {
    return requestJson<{ sessions: CompanionSession[] }>(
      this.baseUrl,
      "/api/companion/sessions",
      this.token,
    );
  }

  createSession(input: {
    name?: string;
    endpointId?: string;
    model?: string;
    rag?: boolean;
  }) {
    return requestJson<{ session: CompanionSession; endpoint_id: string }>(
      this.baseUrl,
      "/api/companion/sessions",
      this.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          endpoint_id: input.endpointId,
          model: input.model,
          rag: input.rag ?? false,
        }),
      },
    );
  }

  history(sessionId: string) {
    return requestJson<{ history: CompanionHistoryMessage[] }>(
      this.baseUrl,
      `/api/history/${encodeURIComponent(sessionId)}`,
      this.token,
    );
  }

  async chatStream(
    input: {
      sessionId: string;
      message: string;
      mode?: string;
      signal?: AbortSignal;
      useWeb?: boolean;
      useResearch?: boolean;
      allowWebSearch?: boolean;
      allowBash?: boolean;
      planMode?: boolean;
      noMemory?: boolean;
    },
    onEvent: (event: ChatStreamEvent) => void,
  ) {
    const formData = new FormData();
    formData.append("message", input.message);
    formData.append("session", input.sessionId);
    appendFormField(formData, "mode", input.mode || "chat");
    appendFormField(formData, "use_web", input.useWeb);
    appendFormField(formData, "use_research", input.useResearch);
    appendFormField(formData, "allow_web_search", input.allowWebSearch);
    appendFormField(formData, "allow_bash", input.allowBash);
    appendFormField(formData, "plan_mode", input.planMode);
    appendFormField(formData, "no_memory", input.noMemory);

    const response = await fetch(joinUrl(this.baseUrl, "/api/chat_stream"), {
      method: "POST",
      headers: authHeaders(this.token),
      body: formData,
      signal: input.signal,
    });
    if (!response.ok) {
      throw new Error(`Chat stream failed: ${response.status}`);
    }
    await readSseResponse(response, onEvent);
  }

  stopStream(sessionId: string) {
    return requestJson<{ stopped: boolean }>(
      this.baseUrl,
      `/api/chat/stop/${encodeURIComponent(sessionId)}`,
      this.token,
      { method: "POST" },
    );
  }

  streamStatus(sessionId: string) {
    return requestJson<{ status: string; detached?: boolean }>(
      this.baseUrl,
      `/api/chat/stream_status/${encodeURIComponent(sessionId)}`,
      this.token,
    );
  }

  async resumeStream(
    sessionId: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ) {
    const streamPath = `/api/chat/resume/${encodeURIComponent(sessionId)}`;
    const response = await fetch(joinUrl(this.baseUrl, streamPath), {
      headers: authHeaders(this.token),
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new OdysseusApiError(streamPath, response.status, body);
    }
    await readSseResponse(response, onEvent);
  }

  registerKey(input: {
    publicKeyB64: string;
    keyId: string;
    label?: string;
  }) {
    return requestJson<{ key: { key_id: string; label?: string } }>(
      this.baseUrl,
      "/api/companion/keys",
      this.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key_b64: input.publicKeyB64,
          key_id: input.keyId,
          label: input.label || "Odysseus mobile",
        }),
      },
    );
  }

  keys() {
    return requestJson<{ keys: { key_id: string; label?: string }[] }>(
      this.baseUrl,
      "/api/companion/keys",
      this.token,
    );
  }

  revokeKey(keyId: string) {
    return requestJson<{ status: string }>(
      this.baseUrl,
      `/api/companion/keys/${encodeURIComponent(keyId)}`,
      this.token,
      { method: "DELETE" },
    );
  }

  goalRuns() {
    return requestJson<{ runs: CompanionGoalRun[] }>(
      this.baseUrl,
      "/api/companion/goals",
      this.token,
    );
  }

  startGoal(input: {
    sessionId: string;
    goal: string;
    useWeb?: boolean;
    allowBash?: boolean;
    maxTurns?: number;
  }) {
    return requestJson<{ run: CompanionGoalRun }>(
      this.baseUrl,
      "/api/companion/goals",
      this.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: input.sessionId,
          goal: input.goal,
          use_web: input.useWeb ?? false,
          allow_bash: input.allowBash ?? false,
          max_turns: input.maxTurns ?? 0,
        }),
        timeoutMs: 15000,
      },
    );
  }

  goalRun(runId: string) {
    return requestJson<{ run: CompanionGoalRun }>(
      this.baseUrl,
      `/api/companion/goals/${encodeURIComponent(runId)}`,
      this.token,
    );
  }

  resumeGoal(runId: string) {
    return requestJson<{ run: CompanionGoalRun }>(
      this.baseUrl,
      `/api/companion/goals/${encodeURIComponent(runId)}/resume`,
      this.token,
      { method: "POST", timeoutMs: 15000 },
    );
  }

  stopGoal(runId: string) {
    return requestJson<{ run: CompanionGoalRun }>(
      this.baseUrl,
      `/api/companion/goals/${encodeURIComponent(runId)}/stop`,
      this.token,
      { method: "POST", timeoutMs: 15000 },
    );
  }

  async command(command: string, args: Record<string, JsonValue>, key: CommandKeyPair) {
    const body = { command, args };
    const { signedCommandHeaders } = await import("@/crypto/companionSigning");
    const headers = await signedCommandHeaders({
      body,
      key,
      path: DEFAULT_COMMAND_PATH,
    });
    return requestJson<{
      ok: boolean;
      verified: Record<string, unknown>;
      command: Record<string, unknown>;
    }>(this.baseUrl, DEFAULT_COMMAND_PATH, this.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }
}
