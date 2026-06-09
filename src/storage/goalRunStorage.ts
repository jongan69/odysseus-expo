import * as FileSystem from "expo-file-system/legacy";

import type { GoalStatus } from "@/utils/goal-runner";

const STORAGE_VERSION = 1;
const STORAGE_ROOT = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}odysseus-goal-runs/`
  : undefined;

export type GoalRunStatus =
  | "idle"
  | "running"
  | "continuing"
  | "paused"
  | "complete"
  | "blocked"
  | "error";

export type GoalTurnRecord = {
  id: string;
  round: number;
  prompt: string;
  response: string;
  status?: GoalStatus;
  startedAt: string;
  completedAt?: string;
};

export type GoalRunRecord = {
  version: typeof STORAGE_VERSION;
  id: string;
  goal: string;
  sessionId: string;
  status: GoalRunStatus;
  round: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  useWeb: boolean;
  allowTerminal: boolean;
  transcript: GoalTurnRecord[];
};

function activeRunPath(scope: string) {
  if (!STORAGE_ROOT) return undefined;
  return `${STORAGE_ROOT}active.${scope}.json`;
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

function isGoalTurn(value: unknown): value is GoalTurnRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as GoalTurnRecord;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.round === "number" &&
    typeof candidate.prompt === "string" &&
    typeof candidate.response === "string" &&
    typeof candidate.startedAt === "string"
  );
}

function normalizeGoalRun(value: GoalRunRecord | null): GoalRunRecord | null {
  if (!value || value.version !== STORAGE_VERSION) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.goal !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.round !== "number" ||
    !Array.isArray(value.transcript)
  ) {
    return null;
  }

  return {
    ...value,
    status: value.status || "paused",
    updatedAt: value.updatedAt || value.startedAt || new Date().toISOString(),
    useWeb: value.useWeb === true,
    allowTerminal: value.allowTerminal === true,
    transcript: value.transcript.filter(isGoalTurn),
  };
}

export async function loadGoalRun(scope: string) {
  const path = activeRunPath(scope);
  if (!path || !(await ensureStorageRoot())) return null;
  return normalizeGoalRun(await readJson<GoalRunRecord | null>(path, null));
}

export async function saveGoalRun(scope: string, run: GoalRunRecord) {
  const path = activeRunPath(scope);
  if (!path || !(await ensureStorageRoot())) return;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(run));
}

export async function clearGoalRun(scope: string) {
  const path = activeRunPath(scope);
  if (!path || !(await ensureStorageRoot())) return;
  await FileSystem.deleteAsync(path, { idempotent: true });
}
