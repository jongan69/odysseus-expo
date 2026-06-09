import { describe, expect, test } from "bun:test";

import type { CompanionGoalRun } from "@/api/odysseusClient";
import {
  isActiveServerGoalRunStatus,
  latestActiveServerGoalRun,
  serverGoalRunToRecord,
} from "./server-goal-runs";

function run(
  id: string,
  status: CompanionGoalRun["status"],
  updatedAt: string,
): CompanionGoalRun {
  return {
    id,
    goal: `Goal ${id}`,
    session_id: `session-${id}`,
    status,
    round: 1,
    started_at: "2026-06-09T00:00:00Z",
    updated_at: updatedAt,
    completed_at: null,
    error: null,
    use_web: false,
    allow_bash: false,
    transcript: [],
    live_text: "",
  };
}

describe("server goal run helpers", () => {
  test("detects server statuses that should stay attached", () => {
    expect(isActiveServerGoalRunStatus("queued")).toBe(true);
    expect(isActiveServerGoalRunStatus("running")).toBe(true);
    expect(isActiveServerGoalRunStatus("continuing")).toBe(true);
    expect(isActiveServerGoalRunStatus("paused")).toBe(false);
    expect(isActiveServerGoalRunStatus("complete")).toBe(false);
  });

  test("selects the newest active server run", () => {
    const selected = latestActiveServerGoalRun([
      run("complete-newer", "complete", "2026-06-09T00:10:00Z"),
      run("running-old", "running", "2026-06-09T00:01:00Z"),
      run("continuing-new", "continuing", "2026-06-09T00:05:00Z"),
    ]);

    expect(selected?.id).toBe("continuing-new");
  });

  test("maps server runs into persisted mobile records", () => {
    const record = serverGoalRunToRecord(
      {
        ...run("run-1", "running", "2026-06-09T00:05:00Z"),
        goal: "Finish the thing",
        round: 2,
        use_web: true,
        allow_bash: true,
        transcript: [
          {
            id: "turn-1",
            round: 1,
            prompt: "Start",
            response: "Need more\nGOAL_STATUS: continue",
            status: "continue",
            started_at: "2026-06-09T00:00:00Z",
            completed_at: "2026-06-09T00:01:00Z",
          },
        ],
      },
      { ...serverGoalRunToRecord(run("run-1", "queued", "2026-06-09T00:00:00Z")), id: "local-id" },
    );

    expect(record.id).toBe("local-id");
    expect(record.remoteRunId).toBe("run-1");
    expect(record.runner).toBe("server");
    expect(record.status).toBe("running");
    expect(record.goal).toBe("Finish the thing");
    expect(record.useWeb).toBe(true);
    expect(record.allowTerminal).toBe(true);
    expect(record.transcript[0]?.status).toBe("continue");
  });
});
