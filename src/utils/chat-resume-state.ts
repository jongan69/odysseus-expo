import type { ChatMessage } from "@/components/chat/types";

export const FINISHED_STREAM_STATUSES = new Set([
  "complete",
  "completed",
  "done",
  "error",
  "idle",
  "not_found",
  "stopped",
]);

export type RecoverableStreamRef = {
  assistantId: string;
  sessionId: string;
};

export type StreamCompletionState = {
  canResume: boolean;
  streamStatusLabel?: string;
};

export function shouldResumeFromStreamStatus(
  status?: { status?: string; detached?: boolean },
) {
  if (!status) return true;
  if (status.detached) return true;
  const normalized = status.status?.trim().toLowerCase();
  if (!normalized) return true;
  return !FINISHED_STREAM_STATUSES.has(normalized);
}

export function removeResumePlaceholder(
  messages: ChatMessage[],
  assistantId: string,
) {
  const hasPlaceholder = messages.some(
    (message) =>
      message.id === assistantId &&
      message.role === "assistant" &&
      message.content === "",
  );
  if (!hasPlaceholder) return { nextMessages: messages, removed: false };
  return {
    nextMessages: messages.filter(
      (message) =>
        !(
          message.id === assistantId &&
          message.role === "assistant" &&
          message.content === ""
        ),
    ),
    removed: true,
  };
}

export function shouldClearRecoverableFromHistory(
  historyMessages: ChatMessage[],
  recoverableStream: RecoverableStreamRef | null,
  sessionMessages: ChatMessage[],
) {
  if (!recoverableStream) return false;
  const recoverablePlaceholderIndex = sessionMessages.findIndex(
    (message) =>
      message.id === recoverableStream.assistantId &&
      message.role === "assistant" &&
      message.content === "",
  );

  if (recoverablePlaceholderIndex === -1) {
    const latestHistoryMessage = historyMessages[historyMessages.length - 1];
    return (
      latestHistoryMessage?.role === "assistant" &&
      latestHistoryMessage.content.trim().length > 0
    );
  }

  const matchedHistoryMessage = historyMessages[recoverablePlaceholderIndex];
  return (
    matchedHistoryMessage?.role === "assistant" &&
    matchedHistoryMessage.content.trim().length > 0
  );
}

export function clearResumeStateAfterStreamComplete(state: StreamCompletionState) {
  return {
    canResume: false,
    streamStatusLabel: state.streamStatusLabel ?? "Done",
  };
}
