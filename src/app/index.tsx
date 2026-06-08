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
import { MainHeader } from "@/components/main-header";
import { PairingScreen } from "@/screens/PairingScreen";
import { useCompanion } from "@/state/companion-store";
import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { RefreshCw, Server } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

const STREAMING_THROTTLE_MS = 32;

function useOdysseusChat() {
  const {
    status,
    client,
    activeSession,
    activeSessionId,
    createSession,
    canChat,
  } = useCompanion();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [streamStatusLabel, setStreamStatusLabel] = useState<string>();
  const [options, setOptions] = useState<ChatOptions>(DEFAULT_CHAT_OPTIONS);
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const abortRef = useRef<AbortController | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, []);

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
    (assistantId: string, content: string) => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      streamingStore.set("");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, content } : message,
        ),
      );
    },
    [streamingStore],
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
      let streamed = "";
      let modelLabel = "";

      setIsGenerating(true);
      setCanResume(false);
      setError(null);
      setStreamStatusLabel(resume ? "Resuming" : "Streaming");
      streamingStore.set("");

      try {
        const onEvent = (event: Parameters<typeof client.chatStream>[1] extends (event: infer E) => void ? E : never) => {
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
        finishAssistantMessage(assistantId, streamed || "Done.");
        setStreamStatusLabel(modelLabel || "Done");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        const nextError =
          err instanceof Error ? err : new Error("Odysseus stream failed");
        if (nextError.name !== "AbortError") {
          setError(nextError);
          finishAssistantMessage(
            assistantId,
            streamed || `Error: ${nextError.message}`,
          );
        } else {
          finishAssistantMessage(assistantId, streamed || "Stopped.");
        }
        setCanResume(true);
      } finally {
        abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [client, finishAssistantMessage, flushStreaming, options, streamingStore],
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

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");

    try {
      const session = activeSession ?? (await createSession({ name: "Mobile companion" }));
      await runStream({
        assistantId,
        sessionId: session.id,
        message: text,
      });
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error("Unable to send");
      setError(nextError);
      finishAssistantMessage(assistantId, `Error: ${nextError.message}`);
    }
  }, [
    activeSession,
    canChat,
    createSession,
    finishAssistantMessage,
    input,
    isGenerating,
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
    setMessages((current) => [
      ...current,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    await runStream({ assistantId, sessionId: activeSessionId, resume: true });
  }, [activeSessionId, isGenerating, runStream]);

  return {
    messages,
    input,
    setInput,
    isGenerating,
    onSend,
    onStop,
    onResume,
    canResume,
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

      const isStreaming = isGenerating && item.content === "";
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
    [isGenerating, streamingStore],
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
