import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@/components/chat/types";
import {
  clearResumeStateAfterStreamComplete,
  removeResumePlaceholder,
  shouldClearRecoverableFromHistory,
  shouldResumeFromStreamStatus,
  type RecoverableStreamRef,
} from "./chat-resume-state";

describe("chat resume state helpers", () => {
  test("completed state clears resumable flag", () => {
    const next = clearResumeStateAfterStreamComplete({
      canResume: true,
      streamStatusLabel: "Streaming gpt",
    });

    expect(next.canResume).toBe(false);
    expect(next.streamStatusLabel).toBe("Streaming gpt");
  });

  test("stream status complete/non-streaming does not request resume", () => {
    expect(shouldResumeFromStreamStatus({ status: "done" })).toBe(false);
    expect(shouldResumeFromStreamStatus({ status: "not_found" })).toBe(false);
    expect(shouldResumeFromStreamStatus({ status: "streaming", detached: true })).toBe(
      true,
    );
  });

  test("completed history clears stale recoverable placeholder state", () => {
    const recoverable: RecoverableStreamRef = {
      assistantId: "assistant-2",
      sessionId: "session-1",
    };
    const sessionMessages: ChatMessage[] = [
      { id: "session-1-0-user", role: "user", content: "Hello" },
      { id: "assistant-2", role: "assistant", content: "" },
    ];
    const historyMessages: ChatMessage[] = [
      { id: "session-1-0-user", role: "user", content: "Hello" },
      { id: "server-1-1-assistant", role: "assistant", content: "Hi there" },
    ];

    expect(
      shouldClearRecoverableFromHistory(
        historyMessages,
        recoverable,
        sessionMessages,
      ),
    ).toBe(true);
  });

  test("in-progress placeholder history does not clear recoverable state", () => {
    const recoverable: RecoverableStreamRef = {
      assistantId: "assistant-2",
      sessionId: "session-1",
    };
    const sessionMessages: ChatMessage[] = [
      { id: "session-1-0-user", role: "user", content: "Hello" },
      { id: "assistant-2", role: "assistant", content: "" },
    ];
    const historyMessages: ChatMessage[] = [
      { id: "session-1-0-user", role: "user", content: "Hello" },
    ];

    expect(
      shouldClearRecoverableFromHistory(
        historyMessages,
        recoverable,
        sessionMessages,
      ),
    ).toBe(false);
  });

  test("resume placeholder messages are removed", () => {
    const messages: ChatMessage[] = [
      { id: "session-1-0-user", role: "user", content: "Hello" },
      { id: "assistant-2", role: "assistant", content: "" },
    ];
    const update = removeResumePlaceholder(messages, "assistant-2");

    expect(update.removed).toBe(true);
    expect(update.nextMessages).toEqual([
      { id: "session-1-0-user", role: "user", content: "Hello" },
    ]);
  });
});
