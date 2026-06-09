import { describe, expect, test } from "bun:test";

import {
  buildContinueGoalPrompt,
  buildInitialGoalPrompt,
  goalSessionName,
  parseGoalStatus,
} from "./goal-runner";

describe("goal runner helpers", () => {
  test("parses explicit goal status markers", () => {
    expect(parseGoalStatus("Done\nGOAL_STATUS: complete")).toBe("complete");
    expect(parseGoalStatus("Need another pass\nGOAL_STATUS: continue")).toBe(
      "continue",
    );
    expect(parseGoalStatus("Waiting on access\nGOAL_STATUS: blocked")).toBe(
      "blocked",
    );
    expect(parseGoalStatus("No marker")).toBeUndefined();
  });

  test("builds a strict initial pursuit prompt", () => {
    const prompt = buildInitialGoalPrompt("Ship the mobile goal loop");

    expect(prompt).toContain("Pursue this goal autonomously");
    expect(prompt).toContain("Goal: Ship the mobile goal loop");
    expect(prompt).toContain("GOAL_STATUS: complete");
    expect(prompt).toContain("GOAL_STATUS: continue");
    expect(prompt).toContain("GOAL_STATUS: blocked");
  });

  test("builds a continuation prompt with missing-marker recovery", () => {
    const prompt = buildContinueGoalPrompt({
      goal: "Finish the task",
      round: 3,
      previousStatusMissing: true,
    });

    expect(prompt).toContain("turn 3");
    expect(prompt).toContain("previous turn did not include");
    expect(prompt).toContain("Goal: Finish the task");
  });

  test("creates compact goal session names", () => {
    expect(goalSessionName("  Fix auth  ")).toBe("Goal: Fix auth");
    expect(goalSessionName("x".repeat(90)).length).toBeLessThanOrEqual(80);
  });
});
