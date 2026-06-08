import { Icon } from "@/components/icon";
import { useCompanion } from "@/state/companion-store";
import { AlertTriangle, KeyRound, LogOut, RefreshCw, Shield, Trash2 } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

export function SettingsScreen() {
  const {
    baseUrl,
    manifest,
    tokenScopes,
    commandKey,
    isInsecureTransport,
    refresh,
    revokeCommandKey,
    forgetAll,
  } = useCompanion();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 py-5 gap-5 android:pb-safe"
    >
      <View className="gap-2">
        <Text className="text-2xl font-semibold text-foreground">Settings</Text>
        <Text selectable className="font-mono text-xs text-muted-foreground">
          {baseUrl ?? "Not paired"}
        </Text>
      </View>

      <View className="gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
        <View className="flex-row items-center gap-3">
          <Icon icon={Shield} className="h-5 w-5 text-foreground" />
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">
              {manifest?.owner ?? "Companion"}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {manifest?.name ?? "odysseus"} {manifest?.version ?? ""}
            </Text>
          </View>
          <Pressable
            onPress={refresh}
            className="h-10 w-10 items-center justify-center rounded-full bg-muted active:bg-accent"
          >
            <Icon icon={RefreshCw} className="h-4 w-4 text-foreground" />
          </Pressable>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {tokenScopes.map((scope) => (
            <Text
              key={scope}
              className="rounded-full bg-muted px-3 py-1.5 font-mono text-xs text-foreground"
            >
              {scope}
            </Text>
          ))}
        </View>
      </View>

      {isInsecureTransport && (
        <View className="flex-row gap-3 rounded-[18px] border border-yellow-500/40 bg-yellow-500/10 p-4 border-continuous">
          <Icon icon={AlertTriangle} className="h-5 w-5 text-yellow-500" />
          <Text className="flex-1 text-sm leading-5 text-yellow-500">
            HTTP pairing is for a trusted same-network development device.
          </Text>
        </View>
      )}

      <View className="gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
        <View className="flex-row items-center gap-3">
          <Icon icon={KeyRound} className="h-5 w-5 text-foreground" />
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">
              Signed Command Key
            </Text>
            <Text selectable className="font-mono text-xs text-muted-foreground">
              {commandKey?.keyId ?? "No local key registered"}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={revokeCommandKey}
          disabled={!commandKey}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-muted py-3 active:bg-accent disabled:opacity-40 border-continuous"
        >
          <Icon icon={Trash2} className="h-4 w-4 text-red-500" />
          <Text className="font-semibold text-red-500">Revoke Local Key</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={forgetAll}
        className="flex-row items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 active:opacity-80 border-continuous"
      >
        <Icon icon={LogOut} className="h-4 w-4 text-background" />
        <Text className="font-semibold text-background">Forget All</Text>
      </Pressable>
    </ScrollView>
  );
}
