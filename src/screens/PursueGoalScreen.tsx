import { Icon } from "@/components/icon";
import {
  isChatStreamInactiveError,
  type CompanionGoalRun,
  type ChatStreamEvent,
  type CompanionHistoryMessage,
} from "@/api/odysseusClient";
import {
  beginBackgroundSession,
  endBackgroundSession,
} from "@/native/backgroundSession";
import { PairingScreen } from "@/screens/PairingScreen";
import { useCompanion } from "@/state/companion-store";
import {
  clearGoalRun,
  loadGoalRun,
  saveGoalRun,
  type GoalRunRecord,
  type GoalRunStatus,
  type GoalTurnRecord,
} from "@/storage/goalRunStorage";
import { chatSessionStorageScope } from "@/storage/chatSessionStorage";
import {
  buildContinueGoalPrompt,
  buildInitialGoalPrompt,
  goalSessionName,
  parseGoalStatus,
  type GoalStatus,
} from "@/utils/goal-runner";
import { shouldResumeFromStreamStatus } from "@/utils/chat-resume-state";
import { cn } from "@/utils/tailwind";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  PauseCircle,
  Play,
  RefreshCw,
  Square,
  Target,
  TerminalSquare,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

const AUTO_GOAL_ROUND_LIMIT = 25;

function nowIso() {
  return new Date().toISOString();
}

function eventStatusLabel(event: ChatStreamEvent) {
  if (event.type === "tool_start") {
    return `Running ${String(event.data.tool || "tool")}`;
  }
  if (event.type === "tool_progress") {
    return `Running ${String(event.data.tool || "tool")}`;
  }
  if (event.type === "tool_output") return "Tool complete";
  if (event.type === "agent_step") {
    const round = event.data.round;
    return typeof round === "number" ? `Agent step ${round}` : "Agent working";
  }
  if (event.type === "model_info" || event.type === "model_actual") {
    const model = String(event.data.model || "");
    return model ? `Streaming ${model}` : "Streaming";
  }
  if (event.type === "fallback") return "Using fallback model";
  if (event.type === "web_sources") return "Using web sources";
  if (event.type === "research") return "Researching";
  return undefined;
}

function statusTone(status?: GoalRunStatus) {
  if (status === "complete") return "text-emerald-500";
  if (status === "blocked" || status === "error") return "text-red-500";
  if (status === "paused" || status === "stopped") return "text-amber-500";
  return "text-foreground";
}

function statusLabel(status?: GoalRunStatus) {
  switch (status) {
    case "running":
      return "Running";
    case "continuing":
      return "Continuing";
    case "paused":
      return "Paused";
    case "queued":
      return "Queued";
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
    default:
      return "Ready";
  }
}

function turnStatusLabel(status?: GoalStatus) {
  switch (status) {
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
    case "continue":
      return "Continue";
    default:
      return "No marker";
  }
}

function isRecoverableRunStatus(status?: GoalRunStatus) {
  return status === "queued" || status === "running" || status === "continuing";
}

function isActiveServerRunStatus(status?: GoalRunStatus) {
  return status === "queued" || status === "running" || status === "continuing";
}

function isOpenTurn(turn?: GoalTurnRecord) {
  return !!turn && !turn.completedAt && !turn.response.trim();
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) {
          return String((block as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content === undefined || content === null) return "";
  return String(content);
}

function latestAssistantText(history: CompanionHistoryMessage[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== "assistant") continue;
    const text = contentToText(message.content).trim();
    if (text) return text;
  }
  return "";
}

function buildInitialRun({
  goal,
  sessionId,
  useWeb,
  allowTerminal,
}: {
  goal: string;
  sessionId: string;
  useWeb: boolean;
  allowTerminal: boolean;
}): GoalRunRecord {
  const timestamp = nowIso();
  return {
    version: 1,
    id: `goal-${Date.now()}`,
    runner: "mobile",
    goal,
    sessionId,
    status: "running",
    round: 0,
    startedAt: timestamp,
    updatedAt: timestamp,
    useWeb,
    allowTerminal,
    transcript: [],
  };
}

function goalStatusFromServer(status: CompanionGoalRun["status"]): GoalRunStatus {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "continuing") return "continuing";
  if (status === "paused") return "paused";
  if (status === "complete") return "complete";
  if (status === "blocked") return "blocked";
  if (status === "stopped") return "stopped";
  return "error";
}

function serverGoalRunToRecord(
  run: CompanionGoalRun,
  previous?: GoalRunRecord | null,
): GoalRunRecord {
  return {
    version: 1,
    id:
      previous?.runner === "server" && previous.remoteRunId === run.id
        ? previous.id
        : `server-goal-${run.id}`,
    remoteRunId: run.id,
    runner: "server",
    goal: run.goal,
    sessionId: run.session_id,
    status: goalStatusFromServer(run.status),
    round: Number(run.round || 0),
    startedAt: run.started_at,
    updatedAt: run.updated_at,
    completedAt: run.completed_at ?? undefined,
    error: run.error ?? undefined,
    useWeb: run.use_web === true,
    allowTerminal: run.allow_bash === true,
    transcript: (run.transcript ?? []).map((turn) => ({
      id: turn.id,
      round: Number(turn.round || 0),
      prompt: String(turn.prompt ?? ""),
      response: String(turn.response ?? ""),
      status: turn.status ?? undefined,
      startedAt: turn.started_at ?? run.started_at,
      completedAt: turn.completed_at ?? undefined,
    })),
  };
}

export function PursueGoalScreen() {
  const {
    status,
    baseUrl,
    pairing,
    client,
    canChat,
    createSession,
    manifest,
  } = useCompanion();
  const [goalInput, setGoalInput] = useState("");
  const [goalRun, setGoalRun] = useState<GoalRunRecord | null>(null);
  const [liveText, setLiveText] = useState("");
  const [statusDetail, setStatusDetail] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [useWeb, setUseWeb] = useState(false);
  const [allowTerminal, setAllowTerminal] = useState(false);
  const runRef = useRef<GoalRunRecord | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const autoResumeKeyRef = useRef<string | undefined>(undefined);
  const scope = useMemo(
    () =>
      chatSessionStorageScope({
        baseUrl,
        token: pairing?.token,
      }),
    [baseUrl, pairing?.token],
  );
  const terminalAvailable = Boolean(
    manifest?.features?.signed_commands?.raw_shell_enabled ||
      manifest?.features?.remote_development?.raw_shell_enabled,
  );
  const serverGoalRunsAvailable = Boolean(
    manifest?.features?.goal_runs?.available !== false &&
      manifest?.features?.goal_runs?.start_path,
  );
  const effectiveAllowTerminal = allowTerminal && terminalAvailable;
  const goalRunId = goalRun?.id;
  const goalRunRound = goalRun?.round;
  const goalRunStatus = goalRun?.status;
  const remoteRunId = goalRun?.runner === "server" ? goalRun.remoteRunId : undefined;
  const serverRunActive = goalRun?.runner === "server" && isActiveServerRunStatus(goalRun.status);

  const persistRun = useCallback(
    (next: GoalRunRecord | null) => {
      runRef.current = next;
      setGoalRun(next);
      if (next) {
        void saveGoalRun(scope, next).catch(() => undefined);
      } else {
        void clearGoalRun(scope).catch(() => undefined);
      }
    },
    [scope],
  );

  const patchRun = useCallback(
    (patch: Partial<GoalRunRecord>) => {
      const current = runRef.current;
      if (!current) return;
      persistRun({
        ...current,
        ...patch,
        updatedAt: nowIso(),
      });
    },
    [persistRun],
  );

  const applyServerGoalRun = useCallback(
    (run: CompanionGoalRun) => {
      const next = serverGoalRunToRecord(run, runRef.current);
      persistRun(next);
      setLiveText(String(run.live_text ?? ""));
      setUseWeb(next.useWeb);
      setAllowTerminal(next.allowTerminal);
      setError(next.error);
      setStatusDetail(
        isActiveServerRunStatus(next.status)
          ? "Running on Odysseus"
          : statusLabel(next.status),
      );
      return next;
    },
    [persistRun],
  );

  const refreshServerGoalRun = useCallback(
    async (runId: string) => {
      if (!client) return undefined;
      const result = await client.goalRun(runId);
      return applyServerGoalRun(result.run);
    },
    [applyServerGoalRun, client],
  );

  useEffect(() => {
    let cancelled = false;
    runRef.current = null;

    void loadGoalRun(scope).then((stored) => {
      if (cancelled) return;
      runRef.current = stored;
      setGoalRun(stored);
      setLiveText("");
      setError(undefined);
      if (stored) {
        setUseWeb(stored.useWeb);
        setAllowTerminal(stored.allowTerminal);
        setStatusDetail(statusLabel(stored.status));
      } else {
        setStatusDetail("Ready");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [scope]);

  const streamGoalTurn = useCallback(
    async ({
      current,
      prompt,
      resume,
    }: {
      current: GoalRunRecord;
      prompt?: string;
      resume?: boolean;
    }) => {
      if (!client) throw new Error("Pair with Odysseus first");
      const controller = new AbortController();
      abortRef.current = controller;
      const backgroundSessionId = await beginBackgroundSession(
        "Odysseus goal loop",
      );
      let streamed = "";

      const onEvent = (event: ChatStreamEvent) => {
        if (event.type === "delta") {
          streamed += event.text;
          setLiveText(streamed);
          setStatusDetail(event.thinking ? "Thinking" : "Streaming");
          return;
        }
        if (event.type === "error") {
          throw new Error(event.error);
        }
        const label = eventStatusLabel(event);
        if (label) setStatusDetail(label);
      };

      try {
        if (resume) {
          await client.resumeStream(current.sessionId, onEvent, controller.signal);
        } else {
          await client.chatStream(
            {
              sessionId: current.sessionId,
              message: prompt ?? "",
              mode: "agent",
              useWeb: current.useWeb,
              allowWebSearch: current.useWeb,
              allowBash: current.allowTerminal && terminalAvailable,
              signal: controller.signal,
            },
            onEvent,
          );
        }
        return streamed;
      } finally {
        await endBackgroundSession(backgroundSessionId);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [client, terminalAvailable],
  );

  const finishGoalTurn = useCallback(
    (current: GoalRunRecord, turn: GoalTurnRecord, streamed: string) => {
      const parsedStatus = parseGoalStatus(streamed);
      const completedTurn = {
        ...turn,
        response: streamed || "Done.",
        status: parsedStatus,
        completedAt: nowIso(),
      };
      const nextTranscript = current.transcript.map((item) =>
        item.id === turn.id ? completedTurn : item,
      );
      const nextStatus =
        parsedStatus === "complete"
          ? "complete"
          : parsedStatus === "blocked"
          ? "blocked"
          : "continuing";
      const nextRun = {
        ...current,
        status: nextStatus,
        completedAt: parsedStatus === "complete" ? nowIso() : undefined,
        updatedAt: nowIso(),
        transcript: nextTranscript,
      } satisfies GoalRunRecord;

      persistRun(nextRun);
      setLiveText("");
      setStatusDetail(parsedStatus ? turnStatusLabel(parsedStatus) : "Continuing");

      return { nextRun, parsedStatus };
    },
    [persistRun],
  );

  const recoverOpenGoalTurn = useCallback(
    async (current: GoalRunRecord, turn: GoalTurnRecord) => {
      if (!client) throw new Error("Pair with Odysseus first");
      setStatusDetail("Checking active goal stream");

      let resumeActiveStream = true;
      try {
        resumeActiveStream = shouldResumeFromStreamStatus(
          await client.streamStatus(current.sessionId),
        );
      } catch {
        resumeActiveStream = true;
      }

      if (resumeActiveStream) {
        setStatusDetail("Resuming active goal stream");
        try {
          const resumed = await streamGoalTurn({ current, resume: true });
          if (resumed.trim()) {
            return finishGoalTurn(current, turn, resumed);
          }
        } catch (err) {
          if (!isChatStreamInactiveError(err)) throw err;
        }
      }

      setStatusDetail("Recovering completed goal turn");
      try {
        const history = await client.history(current.sessionId);
        const recovered = latestAssistantText(history.history ?? []);
        const previousResponses = new Set(
          current.transcript
            .filter((item) => item.id !== turn.id)
            .map((item) => item.response.trim())
            .filter(Boolean),
        );
        if (recovered && !previousResponses.has(recovered)) {
          return finishGoalTurn(current, turn, recovered);
        }
      } catch {
        // Fall through to a marked continuation turn below.
      }

      return finishGoalTurn(
        current,
        turn,
        "The previous goal stream ended before this device recovered a final response.",
      );
    },
    [client, finishGoalTurn, streamGoalTurn],
  );

  const runGoalLoop = useCallback(
    async (startingRun: GoalRunRecord) => {
      if (!client) throw new Error("Pair with Odysseus first");
      stopRequestedRef.current = false;
      setBusy(true);
      setError(undefined);

      let current = startingRun;

      try {
        for (;;) {
          if (stopRequestedRef.current) {
            patchRun({ status: "paused" });
            break;
          }

          const latestTurn = current.transcript[current.transcript.length - 1];
          if (isOpenTurn(latestTurn)) {
            const recovered = await recoverOpenGoalTurn(current, latestTurn);
            current = recovered.nextRun;
            if (
              recovered.parsedStatus === "complete" ||
              recovered.parsedStatus === "blocked"
            ) {
              break;
            }
            continue;
          }

          if (current.round >= AUTO_GOAL_ROUND_LIMIT) {
            patchRun({
              status: "paused",
              error: `Paused after ${AUTO_GOAL_ROUND_LIMIT} mobile turns. Resume to keep pursuing this goal.`,
            });
            setError(
              `Paused after ${AUTO_GOAL_ROUND_LIMIT} mobile turns. Resume to keep pursuing this goal.`,
            );
            break;
          }

          const round = current.round + 1;
          const previousTurn = current.transcript[current.transcript.length - 1];
          const previousStatusMissing =
            !!previousTurn && previousTurn.status === undefined;
          const prompt =
            current.transcript.length === 0
              ? buildInitialGoalPrompt(current.goal)
              : buildContinueGoalPrompt({
                  goal: current.goal,
                  round,
                  previousStatusMissing,
                });
          const turn: GoalTurnRecord = {
            id: `goal-turn-${Date.now()}-${round}`,
            round,
            prompt,
            response: "",
            startedAt: nowIso(),
          };
          current = {
            ...current,
            status: round === 1 ? "running" : "continuing",
            round,
            error: undefined,
            updatedAt: nowIso(),
            transcript: [...current.transcript, turn],
          };
          persistRun(current);
          setStatusDetail(round === 1 ? "Starting goal" : `Continuing turn ${round}`);
          setLiveText("");

          const streamed = await streamGoalTurn({ current, prompt });
          const finished = finishGoalTurn(current, turn, streamed);
          current = finished.nextRun;

          if (
            finished.parsedStatus === "complete" ||
            finished.parsedStatus === "blocked"
          ) {
            break;
          }
        }
      } catch (err) {
        const nextError =
          err instanceof Error ? err : new Error("Goal loop failed");
        if (nextError.name === "AbortError" || stopRequestedRef.current) {
          patchRun({ status: "paused" });
          setStatusDetail("Paused");
        } else {
          patchRun({ status: "error", error: nextError.message });
          setError(nextError.message);
          setStatusDetail("Error");
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [
      client,
      finishGoalTurn,
      patchRun,
      persistRun,
      recoverOpenGoalTurn,
      streamGoalTurn,
    ],
  );

  const startGoal = useCallback(async () => {
    const goal = goalInput.trim();
    if (!goal || !client || !canChat || busy) return;
    setBusy(true);
    setError(undefined);
    setStatusDetail("Creating goal session");
    try {
      const session = await createSession({
        name: goalSessionName(goal),
        rag: false,
      });
      if (serverGoalRunsAvailable) {
        const result = await client.startGoal({
          sessionId: session.id,
          goal,
          useWeb,
          allowBash: effectiveAllowTerminal,
          maxTurns: 0,
        });
        applyServerGoalRun(result.run);
        setGoalInput("");
        setBusy(false);
        return;
      }
      const nextRun = buildInitialRun({
        goal,
        sessionId: session.id,
        useWeb,
        allowTerminal: effectiveAllowTerminal,
      });
      persistRun(nextRun);
      setGoalInput("");
      await runGoalLoop(nextRun);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to start goal";
      setError(message);
      setStatusDetail("Error");
      setBusy(false);
    }
  }, [
    busy,
    canChat,
    client,
    createSession,
    applyServerGoalRun,
    goalInput,
    persistRun,
    runGoalLoop,
    serverGoalRunsAvailable,
    useWeb,
    effectiveAllowTerminal,
  ]);

  const resumeGoal = useCallback(async () => {
    const current = runRef.current;
    if (!current || busy) return;
    if (current.runner === "server" && current.remoteRunId) {
      if (!client) return;
      setBusy(true);
      setError(undefined);
      setStatusDetail("Resuming on Odysseus");
      try {
        const result = await client.resumeGoal(current.remoteRunId);
        applyServerGoalRun(result.run);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to resume goal";
        setError(message);
        setStatusDetail("Error");
      } finally {
        setBusy(false);
      }
      return;
    }
    const nextRun = {
      ...current,
      status: "continuing" as const,
      useWeb,
      allowTerminal: effectiveAllowTerminal,
      updatedAt: nowIso(),
    };
    persistRun(nextRun);
    await runGoalLoop(nextRun);
  }, [
    applyServerGoalRun,
    busy,
    client,
    effectiveAllowTerminal,
    persistRun,
    runGoalLoop,
    useWeb,
  ]);

  useEffect(() => {
    if (!goalRunId || goalRunRound === undefined || busy || !client || !canChat) {
      return;
    }
    if (goalRun?.runner === "server") return;
    if (!isRecoverableRunStatus(goalRunStatus)) return;

    const autoResumeKey = `${goalRunId}:${goalRunRound}`;
    if (autoResumeKeyRef.current === autoResumeKey) return;
    autoResumeKeyRef.current = autoResumeKey;

    const timeout = setTimeout(() => {
      void resumeGoal();
    }, 250);

    return () => clearTimeout(timeout);
  }, [
    busy,
    canChat,
    client,
    goalRun?.runner,
    goalRunId,
    goalRunRound,
    goalRunStatus,
    resumeGoal,
  ]);

  useEffect(() => {
    if (!remoteRunId || !client || !canChat) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        const updated = await refreshServerGoalRun(remoteRunId);
        if (cancelled || !updated) return;
        if (!isActiveServerRunStatus(updated.status) && interval) {
          clearInterval(interval);
          interval = undefined;
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Unable to refresh goal run";
        setError(message);
        setStatusDetail("Server goal refresh failed");
      }
    };

    void poll();
    if (isActiveServerRunStatus(goalRunStatus)) {
      interval = setInterval(() => {
        void poll();
      }, 2500);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [
    canChat,
    client,
    goalRunStatus,
    refreshServerGoalRun,
    remoteRunId,
  ]);

  const stopGoal = useCallback(async () => {
    stopRequestedRef.current = true;
    setStatusDetail("Stopping");
    if (goalRun?.runner === "server" && goalRun.remoteRunId && client) {
      setBusy(true);
      try {
        const result = await client.stopGoal(goalRun.remoteRunId);
        applyServerGoalRun(result.run);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to stop goal";
        setError(message);
        setStatusDetail("Error");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (goalRun?.sessionId && client) {
      await client.stopStream(goalRun.sessionId).catch(() => undefined);
    }
    abortRef.current?.abort();
    patchRun({ status: "paused" });
  }, [
    applyServerGoalRun,
    client,
    goalRun?.remoteRunId,
    goalRun?.runner,
    goalRun?.sessionId,
    patchRun,
  ]);

  const clearRun = useCallback(() => {
    if (busy) return;
    persistRun(null);
    setLiveText("");
    setError(undefined);
    setStatusDetail("Ready");
  }, [busy, persistRun]);

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator />
        <Text className="text-sm text-muted-foreground">Loading Odysseus</Text>
      </View>
    );
  }

  if (status === "unpaired") return <PairingScreen />;

  if (!client || !canChat) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-7">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Icon icon={AlertTriangle} className="h-7 w-7 text-muted-foreground" />
        </View>
        <Text className="text-center text-lg font-semibold text-foreground">
          Chat Scope Required
        </Text>
        <Text className="text-center text-sm leading-5 text-muted-foreground">
          Pair with a companion token that can use chat before pursuing goals.
        </Text>
      </View>
    );
  }

  const canResume =
    !!goalRun &&
    !busy &&
    goalRun.status !== "complete" &&
    !(goalRun.runner === "server" && isActiveServerRunStatus(goalRun.status));
  const resumeLabel =
    goalRun && goalRun.runner !== "server" && isRecoverableRunStatus(goalRun.status)
      ? "Recover"
      : "Resume";
  const primaryDisabled = busy || serverRunActive || !goalInput.trim();
  const canStop = busy || serverRunActive;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      contentContainerClassName="px-5 py-5 gap-5 android:pb-safe"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Icon icon={Target} className="h-5 w-5 text-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-xl font-semibold text-foreground">Pursue Goal</Text>
          <Text className="text-sm text-muted-foreground">
            Agent loop with explicit completion markers
          </Text>
        </View>
      </View>

      <View className="gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
        <TextInput
          editable={!busy}
          multiline
          value={goalInput}
          onChangeText={setGoalInput}
          placeholder="Describe the goal Odysseus should finish end to end"
          textAlignVertical="top"
          className="min-h-28 rounded-xl border border-border bg-background px-3 py-3 text-base leading-6 text-foreground border-continuous"
        />

        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Agent always on
          </Text>
          <ToggleChip
            icon={Globe}
            label="Web"
            active={useWeb}
            disabled={busy || serverRunActive}
            onPress={() => setUseWeb((value) => !value)}
          />
          <ToggleChip
            icon={TerminalSquare}
            label="Terminal"
            active={effectiveAllowTerminal}
            disabled={busy || serverRunActive || !terminalAvailable}
            onPress={() => setAllowTerminal((value) => !value)}
          />
        </View>

        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={startGoal}
            disabled={primaryDisabled}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 active:opacity-80 disabled:opacity-40 border-continuous"
          >
            <Icon icon={Play} className="h-4 w-4 text-background" />
            <Text className="font-semibold text-background">Pursue Goal</Text>
          </Pressable>
          {canResume && (
            <Pressable
              onPress={resumeGoal}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-muted px-4 py-3 active:bg-accent border-continuous"
            >
              <Icon icon={RefreshCw} className="h-4 w-4 text-foreground" />
              <Text className="font-semibold text-foreground">{resumeLabel}</Text>
            </Pressable>
          )}
          {canStop && (
            <Pressable
              onPress={stopGoal}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 active:opacity-80 border-continuous"
            >
              <Icon icon={Square} className="h-4 w-4 text-white" />
              <Text className="font-semibold text-white">Stop</Text>
            </Pressable>
          )}
          {!!goalRun && !busy && !serverRunActive && (
            <Pressable
              onPress={clearRun}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-muted px-4 py-3 active:bg-accent border-continuous"
            >
              <Icon icon={PauseCircle} className="h-4 w-4 text-foreground" />
              <Text className="font-semibold text-foreground">Clear</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View className="gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
        <View className="flex-row items-center gap-3">
          <Icon
            icon={goalRun?.status === "complete" ? CheckCircle2 : Target}
            className={cn("h-5 w-5", statusTone(goalRun?.status))}
          />
          <View className="min-w-0 flex-1">
            <Text className={cn("text-base font-semibold", statusTone(goalRun?.status))}>
              {statusLabel(goalRun?.status)}
            </Text>
            <Text numberOfLines={1} className="text-sm text-muted-foreground">
              {statusDetail}
            </Text>
          </View>
          <Text className="font-mono text-xs text-muted-foreground">
            {goalRun ? `Turn ${goalRun.round}` : "No run"}
          </Text>
        </View>

        {goalRun?.goal && (
          <Text selectable className="text-sm leading-5 text-foreground">
            {goalRun.goal}
          </Text>
        )}

        {(error || goalRun?.error) && (
          <Text selectable className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error || goalRun?.error}
          </Text>
        )}
      </View>

      {!!liveText && (
        <View className="gap-2 rounded-[18px] border border-border bg-card p-4 border-continuous">
          <Text className="text-sm font-semibold text-foreground">Live Turn</Text>
          <Text selectable className="text-sm leading-5 text-foreground">
            {liveText}
          </Text>
        </View>
      )}

      {!!goalRun?.transcript.length && (
        <View className="gap-3">
          {goalRun.transcript
            .slice()
            .reverse()
            .map((turn) => (
              <View
                key={turn.id}
                className="gap-2 rounded-[18px] border border-border bg-card p-4 border-continuous"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 font-mono text-xs font-semibold text-muted-foreground">
                    Turn {turn.round}
                  </Text>
                  <Text
                    className={cn(
                      "rounded-full px-2 py-1 text-[11px] font-semibold",
                      turn.status === "complete"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : turn.status === "blocked"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-foreground/10 text-foreground",
                    )}
                  >
                    {turnStatusLabel(turn.status)}
                  </Text>
                </View>
                <Text selectable className="text-sm leading-5 text-foreground">
                  {turn.response || "Running..."}
                </Text>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

function ToggleChip({
  active,
  disabled,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  icon: typeof Globe;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "h-8 flex-row items-center gap-1.5 rounded-full border px-3 active:bg-muted disabled:opacity-40",
        active ? "border-foreground bg-foreground" : "border-border bg-card",
      )}
    >
      <Icon
        icon={icon}
        className={cn("h-3.5 w-3.5", active ? "text-background" : "text-foreground")}
      />
      <Text
        className={cn(
          "text-xs font-semibold",
          active ? "text-background" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
