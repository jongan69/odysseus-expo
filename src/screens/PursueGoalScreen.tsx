import { Icon } from "@/components/icon";
import { type ChatStreamEvent } from "@/api/odysseusClient";
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
  if (status === "paused") return "text-amber-500";
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
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
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
  const effectiveAllowTerminal = allowTerminal && terminalAvailable;

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

          const controller = new AbortController();
          abortRef.current = controller;
          let streamed = "";

          await client.chatStream(
            {
              sessionId: current.sessionId,
              message: prompt,
              mode: "agent",
              useWeb: current.useWeb,
              allowWebSearch: current.useWeb,
              allowBash: current.allowTerminal && terminalAvailable,
              signal: controller.signal,
            },
            (event) => {
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
            },
          );

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

          current = {
            ...current,
            status: nextStatus,
            completedAt: parsedStatus === "complete" ? nowIso() : undefined,
            updatedAt: nowIso(),
            transcript: nextTranscript,
          };
          persistRun(current);
          setLiveText("");
          setStatusDetail(
            parsedStatus ? turnStatusLabel(parsedStatus) : "Continuing",
          );

          if (parsedStatus === "complete" || parsedStatus === "blocked") break;
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
    [client, patchRun, persistRun, terminalAvailable],
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
    goalInput,
    persistRun,
    runGoalLoop,
    useWeb,
    effectiveAllowTerminal,
  ]);

  const resumeGoal = useCallback(async () => {
    const current = runRef.current;
    if (!current || busy) return;
    const nextRun = {
      ...current,
      status: "continuing" as const,
      useWeb,
      allowTerminal: effectiveAllowTerminal,
      updatedAt: nowIso(),
    };
    persistRun(nextRun);
    await runGoalLoop(nextRun);
  }, [busy, effectiveAllowTerminal, persistRun, runGoalLoop, useWeb]);

  const stopGoal = useCallback(async () => {
    stopRequestedRef.current = true;
    setStatusDetail("Stopping");
    if (goalRun?.sessionId && client) {
      await client.stopStream(goalRun.sessionId).catch(() => undefined);
    }
    abortRef.current?.abort();
    patchRun({ status: "paused" });
  }, [client, goalRun?.sessionId, patchRun]);

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
    goalRun.status !== "running" &&
    goalRun.status !== "continuing";
  const primaryDisabled = busy || !goalInput.trim();

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
            disabled={busy}
            onPress={() => setUseWeb((value) => !value)}
          />
          <ToggleChip
            icon={TerminalSquare}
            label="Terminal"
            active={effectiveAllowTerminal}
            disabled={busy || !terminalAvailable}
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
              <Text className="font-semibold text-foreground">Resume</Text>
            </Pressable>
          )}
          {busy && (
            <Pressable
              onPress={stopGoal}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 active:opacity-80 border-continuous"
            >
              <Icon icon={Square} className="h-4 w-4 text-white" />
              <Text className="font-semibold text-white">Stop</Text>
            </Pressable>
          )}
          {!!goalRun && !busy && (
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
