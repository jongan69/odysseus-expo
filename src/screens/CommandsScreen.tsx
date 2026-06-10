import { Icon } from "@/components/icon";
import { type CommandDefinition } from "@/api/odysseusClient";
import { type JsonValue } from "@/crypto/companionSigning";
import { useCompanion } from "@/state/companion-store";
import { cn } from "@/utils/tailwind";
import { KeyRound, Play, RefreshCw, ShieldCheck, TerminalSquare } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

type ArgsState = Record<string, string | boolean>;

function defaultArgs(command?: CommandDefinition): ArgsState {
  const properties = command?.args_schema?.properties ?? {};
  const out: ArgsState = {};
  for (const [name, schema] of Object.entries(properties)) {
    out[name] = schema.type === "boolean" ? false : "";
  }
  return out;
}

function coerceArgs(command: CommandDefinition | undefined, args: ArgsState) {
  const properties = command?.args_schema?.properties ?? {};
  const out: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(args)) {
    const schema = properties[name];
    if (schema?.type === "boolean") {
      if (value) out[name] = true;
      continue;
    }
    if (typeof value !== "string" || !value.trim()) continue;
    if (schema?.type === "integer" || schema?.type === "number") {
      out[name] = Number(value);
      continue;
    }
    if (schema?.type === "array") {
      out[name] = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
    out[name] = value;
  }
  return out;
}

export function CommandsScreen() {
  const {
    commandCatalog,
    allowedWorkspaceRoots,
    commandKey,
    canUseCommands,
    ensureCommandKeyRegistered,
    sendCommand,
    refresh,
    resetPairing,
    manifest,
    selectedWorkspace,
    setSelectedWorkspace,
  } = useCompanion();
  const [selectedName, setSelectedName] = useState(commandCatalog[0]?.name);
  const selected = useMemo(
    () => commandCatalog.find((command) => command.name === selectedName) ?? commandCatalog[0],
    [commandCatalog, selectedName],
  );
  const [args, setArgs] = useState<ArgsState>(() => defaultArgs(selected));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const [error, setError] = useState<string>();

  function selectCommand(command: CommandDefinition) {
    setSelectedName(command.name);
    setArgs(defaultArgs(command));
    setResult(undefined);
    setError(undefined);
  }

  async function run() {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      const data = await sendCommand(selected.name, coerceArgs(selected, args));
      setResult(JSON.stringify(data.command ?? data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed");
    } finally {
      setBusy(false);
    }
  }

  async function pairAgain() {
    setError(undefined);
    setResult(undefined);
    await resetPairing();
  }

  const properties = selected?.args_schema?.properties ?? {};
  const required = new Set(selected?.args_schema?.required ?? []);
  const showPairAgain = error?.includes("paired Odysseus token was rejected");
  const selectedRequiresWorkspace = Boolean(properties.workspace);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 py-5 gap-5 android:pb-safe"
      keyboardDismissMode="interactive"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Icon icon={TerminalSquare} className="h-5 w-5 text-foreground" />
        </View>
        <View className="flex-1">
          <Text className="text-xl font-semibold text-foreground">Commands</Text>
          <Text className="text-sm text-muted-foreground">
            {manifest?.features?.signed_commands?.status ?? "Manifest-driven catalog"}
          </Text>
        </View>
        <Pressable
          onPress={refresh}
          className="h-10 w-10 items-center justify-center rounded-full bg-muted active:bg-accent"
        >
          <Icon icon={RefreshCw} className="h-4 w-4 text-foreground" />
        </Pressable>
      </View>

      <View className="flex-row items-center gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
        <Icon
          icon={commandKey?.registered ? ShieldCheck : KeyRound}
          className="h-5 w-5 text-foreground"
        />
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">
            {commandKey?.registered ? "Command Key Registered" : "Command Key"}
          </Text>
          <Text className="font-mono text-xs text-muted-foreground">
            {commandKey?.keyId ?? "Generated on device only"}
          </Text>
        </View>
        <Pressable
          onPress={ensureCommandKeyRegistered}
          disabled={!canUseCommands}
          className="rounded-full bg-foreground px-3 py-2 active:opacity-80 disabled:opacity-40"
        >
          <Text className="text-xs font-semibold text-background">
            {commandKey?.registered ? "Ready" : "Register"}
          </Text>
        </Pressable>
      </View>

      {!!allowedWorkspaceRoots.length && (
        <View className="gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
          <View className="gap-1">
            <Text className="text-base font-semibold text-foreground">Workspace</Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Auto-discovered workspace roots from the paired Odysseus server.
            </Text>
          </View>
          <View className="gap-2">
            {allowedWorkspaceRoots.map((workspaceRoot) => {
              const active = selectedWorkspace === workspaceRoot;
              return (
                <Pressable
                  key={workspaceRoot}
                  onPress={() => void setSelectedWorkspace(workspaceRoot)}
                  className={cn(
                    "rounded-xl border px-3 py-3 active:bg-muted border-continuous",
                    active ? "border-foreground bg-muted" : "border-border bg-background",
                  )}
                >
                  <Text
                    className={cn(
                      "font-mono text-xs leading-5",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {workspaceRoot}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View className="gap-2">
        {commandCatalog.map((command) => {
          const selectedCommand = selected?.name === command.name;
          return (
            <Pressable
              key={command.name}
              onPress={() => selectCommand(command)}
              className={cn(
                "rounded-[18px] border p-4 active:bg-muted border-continuous",
                selectedCommand ? "border-foreground bg-muted" : "border-border bg-card",
              )}
            >
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 font-mono text-sm font-semibold text-foreground">
                  {command.name}
                </Text>
                <Text
                  className={cn(
                    "rounded-full px-2 py-1 text-[11px] font-semibold",
                    command.mutating
                      ? "bg-red-500/10 text-red-500"
                      : "bg-foreground/10 text-foreground",
                  )}
                >
                  {command.mutating ? "WRITE" : "READ"}
                </Text>
              </View>
              {command.description && (
                <Text className="mt-2 text-sm leading-5 text-muted-foreground">
                  {command.description}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {selected && (
        <View className="gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
          <Text className="font-mono text-base font-semibold text-foreground">
            {selected.name}
          </Text>
          {selectedRequiresWorkspace && selectedWorkspace && (
            <View className="rounded-xl border border-border bg-background px-3 py-3 border-continuous">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.3px] text-muted-foreground">
                Workspace
              </Text>
              <Text className="mt-1 font-mono text-xs leading-5 text-foreground">
                {selectedWorkspace}
              </Text>
            </View>
          )}
          {Object.entries(properties).map(([name, schema]) => {
            if (name === "workspace" && selectedWorkspace) {
              return null;
            }
            const label = `${name}${required.has(name) ? " *" : ""}`;
            if (schema.type === "boolean") {
              return (
                <View key={name} className="flex-row items-center gap-3">
                  <Text className="flex-1 text-sm text-muted-foreground">
                    {label}
                  </Text>
                  <Switch
                    value={Boolean(args[name])}
                    onValueChange={(value) =>
                      setArgs((current) => ({ ...current, [name]: value }))
                    }
                  />
                </View>
              );
            }
            return (
              <TextInput
                key={name}
                value={String(args[name] ?? "")}
                onChangeText={(value) =>
                  setArgs((current) => ({ ...current, [name]: value }))
                }
                placeholder={
                  schema.enum?.length
                    ? `${label}: ${schema.enum.join(", ")}`
                    : label
                }
                className="rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm text-foreground border-continuous"
              />
            );
          })}
          <Pressable
            onPress={run}
            disabled={busy || !canUseCommands || (selectedRequiresWorkspace && !selectedWorkspace)}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-foreground py-3 active:opacity-80 disabled:opacity-40 border-continuous"
          >
            <Icon icon={Play} className="h-4 w-4 text-background" />
            <Text className="font-semibold text-background">
              {busy ? "Running..." : "Run Signed Command"}
            </Text>
          </Pressable>
        </View>
      )}

      {error && (
        <View className="gap-3 rounded-xl bg-red-500/10 px-4 py-3">
          <Text selectable className="text-sm leading-5 text-red-500">
            {error}
          </Text>
          {showPairAgain && (
            <Pressable
              onPress={pairAgain}
              className="self-start rounded-full bg-red-500 px-3 py-2 active:opacity-80"
            >
              <Text className="text-xs font-semibold text-white">Pair Again</Text>
            </Pressable>
          )}
        </View>
      )}

      {result && (
        <Text
          selectable
          className="rounded-[18px] border border-border bg-card p-4 font-mono text-xs leading-5 text-foreground border-continuous"
        >
          {result}
        </Text>
      )}
    </ScrollView>
  );
}
