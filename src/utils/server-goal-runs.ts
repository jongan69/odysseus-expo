import type { CompanionGoalRun } from "@/api/odysseusClient";
import type { GoalRunRecord, GoalRunStatus } from "@/storage/goalRunStorage";

export function isActiveServerGoalRunStatus(status?: GoalRunStatus) {
  return status === "queued" || status === "running" || status === "continuing";
}

export function goalStatusFromServer(
  status: CompanionGoalRun["status"],
): GoalRunStatus {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "continuing") return "continuing";
  if (status === "paused") return "paused";
  if (status === "complete") return "complete";
  if (status === "blocked") return "blocked";
  if (status === "stopped") return "stopped";
  return "error";
}

export function serverGoalRunToRecord(
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

export function latestActiveServerGoalRun(
  runs: CompanionGoalRun[],
): CompanionGoalRun | undefined {
  return runs
    .filter((run) => isActiveServerGoalRunStatus(goalStatusFromServer(run.status)))
    .sort((left, right) =>
      String(right.updated_at || right.started_at || "").localeCompare(
        String(left.updated_at || left.started_at || ""),
      ),
    )[0];
}
