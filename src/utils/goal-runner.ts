export type GoalStatus = "complete" | "continue" | "blocked";

const GOAL_STATUS_PATTERN = /^GOAL_STATUS:\s*(complete|continue|blocked)\b/im;
const MAX_SESSION_TITLE_LENGTH = 72;

export function parseGoalStatus(text: string): GoalStatus | undefined {
  const match = GOAL_STATUS_PATTERN.exec(text);
  return match?.[1]?.toLowerCase() as GoalStatus | undefined;
}

export function goalSessionName(goal: string) {
  const compact = goal.replace(/\s+/g, " ").trim();
  if (!compact) return "Goal";
  const title =
    compact.length > MAX_SESSION_TITLE_LENGTH
      ? `${compact.slice(0, MAX_SESSION_TITLE_LENGTH - 1).trim()}...`
      : compact;
  return `Goal: ${title}`;
}

export function buildInitialGoalPrompt(goal: string) {
  return [
    "Pursue this goal autonomously until it is 100% complete.",
    "",
    `Goal: ${goal.trim()}`,
    "",
    "Work in a loop. Make a concrete plan, take the next action, inspect results, and keep going.",
    "Use available tools when they are needed. Verify the final state before claiming completion.",
    "Do not stop early because the work is lengthy. If more work remains, say so with the continuation marker.",
    "If you are blocked by missing credentials, permissions, destructive-risk confirmation, or required user input, stop and mark the goal blocked.",
    "",
    "End every turn with exactly one of these lines:",
    "GOAL_STATUS: complete",
    "GOAL_STATUS: continue",
    "GOAL_STATUS: blocked",
    "",
    "Only use GOAL_STATUS: complete when the goal is fully done and verified.",
  ].join("\n");
}

export function buildContinueGoalPrompt({
  goal,
  round,
  previousStatusMissing,
}: {
  goal: string;
  round: number;
  previousStatusMissing?: boolean;
}) {
  return [
    `Continue pursuing the same goal. This is mobile goal loop turn ${round}.`,
    "",
    `Goal: ${goal.trim()}`,
    "",
    previousStatusMissing
      ? "Your previous turn did not include the required GOAL_STATUS line. Continue the actual work and include the marker this time."
      : "Continue from the current state. Do not restart from scratch unless the current state proves that is necessary.",
    "Take the next concrete action, verify results, and keep going until the goal is complete or genuinely blocked.",
    "",
    "End this turn with exactly one of:",
    "GOAL_STATUS: complete",
    "GOAL_STATUS: continue",
    "GOAL_STATUS: blocked",
  ].join("\n");
}
