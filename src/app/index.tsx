import {
  ChatProvider,
  Conversation,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageResponse,
  PromptInput,
  PromptInputAction,
  PromptInputAccessory,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  StreamingMessage,
  createStreamingStore,
  type ChatMessage,
} from "@/components/chat";
import {
  DEFAULT_CHAT_OPTIONS,
  ToolToggles,
  type ChatOptions,
} from "@/components/chat/tool-toggles";
import { Icon } from "@/components/icon";
import type { CompanionHistoryMessage } from "@/api/odysseusClient";
import { MainHeader } from "@/components/main-header";
import {
  beginBackgroundSession,
  endBackgroundSession,
  getBackgroundTimeRemaining,
} from "@/native/backgroundSession";
import { PairingScreen } from "@/screens/PairingScreen";
import { useCompanion } from "@/state/companion-store";
import {
  chatSessionStorageScope,
  loadChatSessionMessages,
  saveChatSessionMessages,
} from "@/storage/chatSessionStorage";
import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { RefreshCw, Server } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Text, View } from "react-native";

const STREAMING_THROTTLE_MS = 32;
const FINISHED_STREAM_STATUSES = new Set([
  "complete",
  "completed",
  "done",
  "error",
  "idle",
  "not_found",
  "stopped",
]);

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

function historyMessageToChatMessage(
  sessionId: string,
  message: CompanionHistoryMessage,
  index: number,
): ChatMessage | undefined {
  if (message.role !== "user" && message.role !== "assistant") return undefined;
  return {
    id: `${sessionId}-${index}-${message.role}`,
    role: message.role,
    content: contentToText(message.content),
  };
}

function shouldResumeStreamStatus(status?: { status?: string; detached?: boolean }) {
  if (!status) return true;
  if (status.detached) return true;
  const normalized = status.status?.trim().toLowerCase();
  if (!normalized) return true;
  return !FINISHED_STREAM_STATUSES.has(normalized);
}

function useOdysseusChat() {
  const {
    status,
    baseUrl,
    pairing,
    client,
    activeSession,
    activeSessionId,
    createSession,
    canChat,
    refresh,
  } = useCompanion();
  const [input, setInput] = useState("");
  const [messagesState, setMessagesState] = useState<{
    scope: string;
    messagesBySession: Record<string, ChatMessage[]>;
  }>(() => ({ scope: "", messagesBySession: {} }));
  const messagesBySessionRef = useRef<Record<string, ChatMessage[]>>({});
  const storageScopeRef = useRef("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingSessionId, setGeneratingSessionId] = useState<string>();
  const [error, setError] = useState<Error | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [streamStatusLabel, setStreamStatusLabel] = useState<string>();
  const [options, setOptions] = useState<ChatOptions>(DEFAULT_CHAT_OPTIONS);
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const abortRef = useRef<AbortController | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGeneratingRef = useRef(false);
  const activeStreamRef = useRef<{
    assistantId: string;
    sessionId: string;
  } | null>(null);
  const recoverableStreamRef = useRef<{
    assistantId: string;
    sessionId: string;
  } | null>(null);
  const autoRecoveryAttemptsRef = useRef<Record<string, number>>({});
  const lastStreamEventAtRef = useRef(0);
  const suppressAbortFinishRef = useRef<Record<string, boolean>>({});
  const storageScope = useMemo(
    () =>
      chatSessionStorageScope({
        baseUrl,
        token: pairing?.token,
      }),
    [baseUrl, pairing?.token],
  );
  const messagesBySession =
    messagesState.scope === storageScope ? messagesState.messagesBySession : {};
  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : [];

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, []);

  const replaceSessionMessages = useCallback(
    (sessionId: string, nextMessages: ChatMessage[]) => {
      if (storageScopeRef.current !== storageScope) {
        storageScopeRef.current = storageScope;
        messagesBySessionRef.current = {};
      }
      const nextState = {
        ...messagesBySessionRef.current,
        [sessionId]: nextMessages,
      };
      messagesBySessionRef.current = nextState;
      setMessagesState({
        scope: storageScope,
        messagesBySession: nextState,
      });
    },
    [storageScope],
  );

  const persistSessionMessages = useCallback(
    (
      sessionId: string,
      updater:
        | ChatMessage[]
        | ((currentMessages: ChatMessage[]) => ChatMessage[]),
    ) => {
      if (storageScopeRef.current !== storageScope) {
        storageScopeRef.current = storageScope;
        messagesBySessionRef.current = {};
      }
      const currentMessages = messagesBySessionRef.current[sessionId] ?? [];
      const nextMessages =
        typeof updater === "function" ? updater(currentMessages) : updater;
      replaceSessionMessages(sessionId, nextMessages);

      void saveChatSessionMessages(storageScope, sessionId, nextMessages).catch(
        (err: unknown) => {
          setError(
            err instanceof Error
              ? err
              : new Error("Unable to save chat session state"),
          );
        },
      );
    },
    [replaceSessionMessages, storageScope],
  );

  const hydrateSessionFromSources = useCallback(
    async (sessionId: string, isCancelled: () => boolean = () => false) => {
      const localMessages = await loadChatSessionMessages(
        storageScope,
        sessionId,
      );
      if (isCancelled()) return;
      if (localMessages.length) {
        const existingMessages = messagesBySessionRef.current[sessionId] ?? [];
        if (!existingMessages.length) {
          replaceSessionMessages(sessionId, localMessages);
        }
      }

      if (!client) return;
      try {
        const response = await client.history(sessionId);
        if (isCancelled()) return;
        const historyMessages = response.history
          .map((message, index) =>
            historyMessageToChatMessage(sessionId, message, index),
          )
          .filter((message): message is ChatMessage => Boolean(message));

        const latestMessages = messagesBySessionRef.current[sessionId] ?? [];
        if (latestMessages.length > localMessages.length) return;

        if (historyMessages.length || !latestMessages.length) {
          replaceSessionMessages(sessionId, historyMessages);
          await saveChatSessionMessages(
            storageScope,
            sessionId,
            historyMessages,
          );
        }
      } catch {
        // Local persistence is the fallback when the companion history endpoint is unavailable.
      }
    },
    [client, replaceSessionMessages, storageScope],
  );

  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;

    void hydrateSessionFromSources(activeSessionId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, hydrateSessionFromSources]);

  const flushStreaming = useCallback(
    (text: string) => {
      if (throttleRef.current) return;
      throttleRef.current = setTimeout(() => {
        streamingStore.set(text);
        throttleRef.current = null;
      }, STREAMING_THROTTLE_MS);
    },
    [streamingStore],
  );

  const finishAssistantMessage = useCallback(
    (sessionId: string, assistantId: string, content: string) => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      streamingStore.set("");
      persistSessionMessages(sessionId, (current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, content } : message,
        ),
      );
    },
    [persistSessionMessages, streamingStore],
  );

  const runStream = useCallback(
    async ({
      assistantId,
      sessionId,
      message,
      resume,
    }: {
      assistantId: string;
      sessionId: string;
      message?: string;
      resume?: boolean;
    }) => {
      if (!client) throw new Error("Pair with Odysseus first");
      const controller = new AbortController();
      abortRef.current = controller;
      activeStreamRef.current = { assistantId, sessionId };
      lastStreamEventAtRef.current = Date.now();
      const backgroundSessionId = await beginBackgroundSession(
        "Odysseus chat stream",
      );
      let streamed = "";
      let modelLabel = "";

      setIsGenerating(true);
      setGeneratingSessionId(sessionId);
      setCanResume(false);
      setError(null);
      setStreamStatusLabel(resume ? "Resuming" : "Streaming");
      streamingStore.set("");

      try {
        const onEvent = (event: Parameters<typeof client.chatStream>[1] extends (event: infer E) => void ? E : never) => {
          lastStreamEventAtRef.current = Date.now();
          if (event.type === "delta") {
            streamed += event.text;
            flushStreaming(streamed);
            return;
          }
          if (event.type === "model_info") {
            modelLabel = String(event.data.model || "");
            setStreamStatusLabel(modelLabel ? `Streaming ${modelLabel}` : "Streaming");
            return;
          }
          if (event.type === "metrics") {
            const tokens = event.data.output_tokens ?? event.data.total_tokens;
            const tps = event.data.tokens_per_second;
            if (tokens || tps) {
              setStreamStatusLabel(
                [tokens ? `${tokens} tokens` : "", tps ? `${tps} tok/s` : ""]
                  .filter(Boolean)
                  .join(" · "),
              );
            }
            return;
          }
          if (event.type === "tool_output") {
            streamed += `\n\n\`\`\`\n${String(event.data.output ?? "")}\n\`\`\``;
            flushStreaming(streamed);
            return;
          }
          if (event.type === "research") {
            setStreamStatusLabel(event.eventType.replace(/_/g, " "));
            return;
          }
          if (event.type === "error") {
            throw new Error(event.error);
          }
        };

        if (resume) {
          await client.resumeStream(sessionId, onEvent, controller.signal);
        } else {
          await client.chatStream(
            {
              sessionId,
              message: message ?? "",
              mode: options.agent ? "agent" : "chat",
              useWeb: options.web,
              useResearch: options.research,
              allowWebSearch: options.web,
              allowBash: options.terminal,
              signal: controller.signal,
            },
            onEvent,
          );
        }
        recoverableStreamRef.current = null;
        finishAssistantMessage(sessionId, assistantId, streamed || "Done.");
        setStreamStatusLabel(modelLabel || "Done");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        const nextError =
          err instanceof Error ? err : new Error("Odysseus stream failed");
        if (nextError.name !== "AbortError") {
          setError(nextError);
          finishAssistantMessage(
            sessionId,
            assistantId,
            streamed || `Error: ${nextError.message}`,
          );
          recoverableStreamRef.current = { assistantId, sessionId };
          setCanResume(true);
        } else if (suppressAbortFinishRef.current[assistantId]) {
          delete suppressAbortFinishRef.current[assistantId];
          setCanResume(false);
          setStreamStatusLabel("Done");
        } else if (recoverableStreamRef.current?.assistantId === assistantId) {
          setCanResume(true);
          setStreamStatusLabel("Reconnecting");
        } else {
          finishAssistantMessage(sessionId, assistantId, streamed || "Stopped.");
          if (AppState.currentState !== "active") {
            recoverableStreamRef.current = { assistantId, sessionId };
          }
          setCanResume(true);
        }
      } finally {
        await endBackgroundSession(backgroundSessionId);
        abortRef.current = null;
        if (activeStreamRef.current?.assistantId === assistantId) {
          activeStreamRef.current = null;
        }
        setGeneratingSessionId(undefined);
        setIsGenerating(false);
        void refresh();
      }
    },
    [
      client,
      finishAssistantMessage,
      flushStreaming,
      options,
      refresh,
      streamingStore,
    ],
  );

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isGenerating || !canChat) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: text,
    };
    const assistantId = `${Date.now()}-assistant`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };
    let sessionId: string | undefined;

    try {
      const session = activeSession ?? (await createSession({ name: "Mobile companion" }));
      sessionId = session.id;
      persistSessionMessages(sessionId, (current) => [
        ...current,
        userMessage,
        assistantMessage,
      ]);
      setInput("");
      await runStream({
        assistantId,
        sessionId,
        message: text,
      });
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error("Unable to send");
      setError(nextError);
      if (sessionId) {
        finishAssistantMessage(
          sessionId,
          assistantId,
          `Error: ${nextError.message}`,
        );
      }
    }
  }, [
    activeSession,
    canChat,
    createSession,
    finishAssistantMessage,
    input,
    isGenerating,
    persistSessionMessages,
    runStream,
  ]);

  const onStop = useCallback(async () => {
    if (!activeSessionId || !client) return;
    setStreamStatusLabel("Stopping");
    await client.stopStream(activeSessionId).catch(() => undefined);
    abortRef.current?.abort();
    setCanResume(true);
  }, [activeSessionId, client]);

  const onResume = useCallback(async () => {
    if (!activeSessionId || isGenerating) return;
    const assistantId = `${Date.now()}-assistant-resume`;
    persistSessionMessages(activeSessionId, (current) => [
      ...current,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    await runStream({ assistantId, sessionId: activeSessionId, resume: true });
  }, [activeSessionId, isGenerating, persistSessionMessages, runStream]);

  const recoverForegroundStream = useCallback(async () => {
    if (!client) return;
    void refresh();
    if (activeSessionId) {
      await hydrateSessionFromSources(activeSessionId);
    }

    const recoverableStream = recoverableStreamRef.current ?? activeStreamRef.current;
    if (!recoverableStream) return;

    const statusResponse = await client
      .streamStatus(recoverableStream.sessionId)
      .catch(() => undefined);
    await hydrateSessionFromSources(recoverableStream.sessionId);
    if (!shouldResumeStreamStatus(statusResponse)) {
      recoverableStreamRef.current = null;
      setCanResume(false);
      if (activeStreamRef.current?.assistantId === recoverableStream.assistantId) {
        suppressAbortFinishRef.current[recoverableStream.assistantId] = true;
        abortRef.current?.abort();
      }
      return;
    }

    if (isGeneratingRef.current) {
      const streamIsRecentlyActive =
        Date.now() - lastStreamEventAtRef.current < 3000;
      if (streamIsRecentlyActive && !statusResponse?.detached) return;
      recoverableStreamRef.current = recoverableStream;
      setCanResume(true);
      setStreamStatusLabel("Reconnecting");
      abortRef.current?.abort();
      return;
    }

    let assistantId = `${Date.now()}-assistant-background-resume`;
    recoverableStreamRef.current = null;
    persistSessionMessages(recoverableStream.sessionId, (current) => {
      const openAssistant = current.find(
        (message) => message.role === "assistant" && message.content === "",
      );
      if (openAssistant) {
        assistantId = openAssistant.id;
        return current;
      }
      return [
        ...current,
        { id: assistantId, role: "assistant", content: "" },
      ];
    });
    await runStream({
      assistantId,
      sessionId: recoverableStream.sessionId,
      resume: true,
    });
  }, [
    activeSessionId,
    client,
    hydrateSessionFromSources,
    persistSessionMessages,
    refresh,
    runStream,
  ]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackgrounded =
        previousState === "background" || previousState === "inactive";
      previousState = nextState;

      if (nextState === "background" || nextState === "inactive") {
        if (isGeneratingRef.current) {
          setStreamStatusLabel("Continuing in background");
          void getBackgroundTimeRemaining().then((seconds) => {
            if (!isGeneratingRef.current || seconds <= 0) return;
            setStreamStatusLabel(
              `Continuing in background (${Math.floor(seconds)}s left)`,
            );
          });
        }
        return;
      }

      if (nextState === "active" && wasBackgrounded) {
        void recoverForegroundStream();
      }
    });

    return () => subscription.remove();
  }, [recoverForegroundStream]);

  useEffect(() => {
    if (!canResume || isGenerating || AppState.currentState !== "active") return;
    const recoverableStream = recoverableStreamRef.current;
    if (!recoverableStream) return;
    const recoveryKey = `${recoverableStream.sessionId}:${recoverableStream.assistantId}`;
    if (autoRecoveryAttemptsRef.current[recoveryKey]) return;
    autoRecoveryAttemptsRef.current[recoveryKey] = 1;

    const timeout = setTimeout(() => {
      void recoverForegroundStream();
    }, 250);

    return () => clearTimeout(timeout);
  }, [canResume, isGenerating, recoverForegroundStream]);

  return {
    messages,
    input,
    setInput,
    isGenerating,
    onSend,
    onStop,
    onResume,
    canResume,
    generatingSessionId,
    streamStatusLabel,
    options,
    setOptions,
    streamingStore,
    error,
    ready: status === "paired" && canChat,
  };
}

export default function ChatScreen() {
  const companion = useCompanion();
  const chat = useOdysseusChat();
  const { isGenerating, streamingStore } = chat;
  const activeSessionIsGenerating =
    isGenerating && chat.generatingSessionId === companion.activeSessionId;
  const terminalAvailable = Boolean(
    companion.canUseCommands &&
      (companion.manifest?.features?.signed_commands?.raw_shell_enabled ||
        companion.manifest?.features?.remote_development?.raw_shell_enabled),
  );

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      if (item.role === "user") {
        return <Message from="user">{item.content}</Message>;
      }

      const isStreaming = activeSessionIsGenerating && item.content === "";
      return (
        <Message from="assistant">
          {isStreaming ? (
            <StreamingMessage store={streamingStore} />
          ) : (
            <MessageResponse>{item.content}</MessageResponse>
          )}
        </Message>
      );
    },
    [activeSessionIsGenerating, streamingStore],
  );

  if (companion.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator />
        <Text className="text-sm text-muted-foreground">Loading Odysseus</Text>
      </View>
    );
  }

  if (companion.status === "unpaired") {
    return <PairingScreen />;
  }

  if (companion.status === "error") {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <Text className="text-center text-lg font-semibold text-foreground">
          Connection Failed
        </Text>
        <Text selectable className="text-center text-sm leading-5 text-muted-foreground">
          {companion.error ?? "Unable to reach the paired Odysseus server."}
        </Text>
      </View>
    );
  }

  if (!companion.manifest) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <ActivityIndicator />
        <Text className="text-center text-sm leading-5 text-muted-foreground">
          Connecting to the paired Odysseus server
        </Text>
      </View>
    );
  }

  if (!chat.ready) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <Text className="text-center text-lg font-semibold text-foreground">
          Chat Scope Missing
        </Text>
        <Text className="text-center text-sm leading-5 text-muted-foreground">
          Pair with a companion token that carries the{" "}
          {companion.manifest.auth?.required_bearer_scope ?? "chat"} scope.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ChatProvider value={chat}>
        <Conversation
          renderMessage={renderMessage}
          emptyState={
            <ConversationEmptyState
              title="Odysseus"
              description={
                companion.activeSession
                  ? companion.activeSession.name
                  : "Send a message to create a companion session"
              }
            />
          }
        >
          <ConversationScrollButton />
          <PromptInput>
            <Link href="/session" asChild>
              <PromptInputAction>
                <Icon icon={Server} className="h-5 w-5 text-muted-foreground" />
              </PromptInputAction>
            </Link>
            {chat.canResume && (
              <PromptInputAction onPress={chat.onResume}>
                <Icon icon={RefreshCw} className="h-5 w-5 text-muted-foreground" />
              </PromptInputAction>
            )}
            <PromptInputBody>
              <PromptInputTextarea />
              <PromptInputSubmit />
            </PromptInputBody>
            <PromptInputAccessory>
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <ToolToggles
                  value={chat.options}
                  onChange={chat.setOptions}
                  disabled={chat.isGenerating}
                  terminalAvailable={terminalAvailable}
                />
                {chat.streamStatusLabel && (
                  <Text
                    numberOfLines={1}
                    className="min-w-0 flex-1 text-right text-xs text-muted-foreground"
                  >
                    {chat.streamStatusLabel}
                  </Text>
                )}
              </View>
            </PromptInputAccessory>
          </PromptInput>
        </Conversation>
      </ChatProvider>
      <MainHeader />
    </>
  );
}
