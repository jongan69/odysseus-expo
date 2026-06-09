import { Icon } from "@/components/icon";
import { useCompanion } from "@/state/companion-store";
import { cn } from "@/utils/tailwind";
import {
  Archive,
  Check,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Server,
  Trash2,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

export function SessionScreen() {
  const {
    status,
    endpoints,
    sessions,
    activeSessionId,
    selectedModel,
    selectedEndpoint,
    setSelectedModel,
    setActiveSessionId,
    archiveSession,
    deleteSession,
    createSession,
    refresh,
    error,
  } = useCompanion();
  const [name, setName] = useState("Mobile companion");
  const [rag, setRag] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string>();

  const model = selectedModel ?? selectedEndpoint?.models?.[0];
  const filteredSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) =>
      [
        session.name,
        session.model,
        session.id,
        String(session.message_count),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, sessions]);

  async function handleCreate() {
    setBusy(true);
    try {
      await createSession({
        name,
        endpointId: selectedEndpoint?.endpoint_id,
        model,
        rag,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveSession(sessionId: string) {
    if (busySessionId) return;
    setBusySessionId(sessionId);
    try {
      await archiveSession(sessionId);
    } finally {
      setBusySessionId(undefined);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (busySessionId) return;
    setBusySessionId(sessionId);
    try {
      await deleteSession(sessionId);
    } finally {
      setBusySessionId(undefined);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 py-5 gap-5 android:pb-safe"
      keyboardDismissMode="interactive"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Icon icon={Server} className="h-5 w-5 text-foreground" />
        </View>
        <View className="flex-1">
          <Text className="text-xl font-semibold text-foreground">Session</Text>
          <Text className="text-sm text-muted-foreground">
            {status === "paired" ? "Owner-visible Odysseus models" : "Pair first"}
          </Text>
        </View>
        <Pressable
          onPress={refresh}
          className="h-10 w-10 items-center justify-center rounded-full bg-muted active:bg-accent"
        >
          <Icon icon={RefreshCw} className="h-4 w-4 text-foreground" />
        </Pressable>
      </View>

      {error && (
        <Text selectable className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </Text>
      )}

      <View className="gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
        <Text className="text-base font-semibold text-foreground">New Chat</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Session name"
          className="rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground border-continuous"
        />

        <View className="gap-2">
          {endpoints.map((endpoint) => {
            const selected = selectedEndpoint?.endpoint_id === endpoint.endpoint_id;
            return (
              <Pressable
                key={endpoint.endpoint_id}
                onPress={() => {
                  setSelectedModel(endpoint.endpoint_id, endpoint.models[0]);
                }}
                className={cn(
                  "rounded-xl border px-3 py-3 active:bg-muted border-continuous",
                  selected ? "border-foreground bg-muted" : "border-border bg-background",
                )}
              >
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 text-base font-medium text-foreground">
                    {endpoint.name}
                  </Text>
                  {selected && <Icon icon={Check} className="h-4 w-4 text-foreground" />}
                </View>
                <Text
                  numberOfLines={1}
                  className="mt-1 font-mono text-xs text-muted-foreground"
                >
                  {endpoint.endpoint_url}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selectedEndpoint && (
          <View className="flex-row flex-wrap gap-2">
            {selectedEndpoint.models.map((item) => (
              <Pressable
                key={item}
                onPress={() => setSelectedModel(selectedEndpoint.endpoint_id, item)}
                className={cn(
                  "rounded-full border px-3 py-2 active:bg-muted",
                  model === item
                    ? "border-foreground bg-foreground"
                    : "border-border bg-background",
                )}
              >
                <Text
                  className={cn(
                    "font-mono text-xs",
                    model === item ? "text-background" : "text-foreground",
                  )}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View className="flex-row items-center gap-3">
          <Text className="flex-1 text-sm text-muted-foreground">RAG</Text>
          <Switch value={rag} onValueChange={setRag} />
        </View>

        <Pressable
          onPress={handleCreate}
          disabled={busy || !model}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-foreground py-3 active:opacity-80 disabled:opacity-40 border-continuous"
        >
          <Icon icon={MessageSquarePlus} className="h-4 w-4 text-background" />
          <Text className="font-semibold text-background">
            {busy ? "Creating..." : "Create Session"}
          </Text>
        </Pressable>
      </View>

      <View className="gap-2">
        <View className="flex-row items-center gap-2 px-1">
          <Text className="flex-1 text-sm font-semibold text-muted-foreground">
            Sessions
          </Text>
          <Text className="font-mono text-xs text-muted-foreground">
            {filteredSessions.length}
          </Text>
        </View>
        <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 border-continuous">
          <Icon icon={Search} className="h-4 w-4 text-muted-foreground" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search sessions"
            className="min-w-0 flex-1 text-base text-foreground"
          />
        </View>
        {filteredSessions.map((session) => {
          const selected = session.id === activeSessionId;
          const isBusy = busySessionId === session.id;
          return (
            <View
              key={session.id}
              className={cn(
                "flex-row gap-2 rounded-[18px] border border-continuous p-3",
                selected ? "border-foreground bg-muted" : "border-border bg-card",
              )}
            >
              <Pressable
                onPress={() => setActiveSessionId(session.id)}
                className="flex-1 rounded-xl"
              >
                <Text className="text-base font-semibold text-foreground">
                  {session.name || "Companion"}
                </Text>
                <Text className="mt-1 font-mono text-xs text-muted-foreground">
                  {session.model || "model pending"} · {session.message_count} messages
                </Text>
              </Pressable>
              <View className="flex-row items-center gap-2">
                <Pressable
                  disabled={!!isBusy}
                  onPress={() => handleArchiveSession(session.id)}
                  className={cn(
                    "h-10 w-10 items-center justify-center rounded-full bg-muted active:bg-accent",
                    isBusy && "opacity-50",
                  )}
                >
                  <Icon icon={Archive} className="h-4 w-4 text-foreground" />
                </Pressable>
                <Pressable
                  disabled={!!isBusy}
                  onPress={() => handleDeleteSession(session.id)}
                  className={cn(
                    "h-10 w-10 items-center justify-center rounded-full bg-muted active:bg-accent",
                    isBusy && "opacity-50",
                  )}
                >
                  <Icon icon={Trash2} className="h-4 w-4 text-foreground" />
                </Pressable>
              </View>
            </View>
          );
        })}
        {!filteredSessions.length && (
          <Text className="rounded-[18px] border border-border bg-card p-4 text-sm text-muted-foreground border-continuous">
            No sessions match that search.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
