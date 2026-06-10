import { Icon } from "@/components/icon";
import { useCompanion } from "@/state/companion-store";
import { cn } from "@/utils/tailwind";
import { Link } from "expo-router";
import {
  CalendarDays,
  Check,
  Folder,
  ListTodo,
  Mail,
  Mic,
  Paperclip,
  ShieldCheck,
  StickyNote,
  Target,
  TerminalSquare,
  Wrench,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

type ToolFeature = {
  title: string;
  description: string;
  enabled: boolean;
  detail: string;
  href?: "/commands" | "/goal";
  icon: LucideIcon;
};

function endpointAvailable(paths: string[], needle: string) {
  return paths.some((path) => path.includes(needle));
}

export function ToolsScreen() {
  const { canChat, canUseCommands, canUseAgentBash, commandCatalog, manifest } = useCompanion();
  const commandNames = useMemo(
    () => new Set(commandCatalog.map((command) => command.name)),
    [commandCatalog],
  );
  const endpointPaths = useMemo(
    () => Object.values(manifest?.endpoints ?? {}).map((endpoint) => endpoint.path),
    [manifest?.endpoints],
  );
  const rawShellEnabled = canUseAgentBash;
  const workspaceFilesEnabled = Boolean(
    manifest?.features?.remote_development?.workspace_file_control_enabled ||
      commandNames.has("list_files") ||
      commandNames.has("read_file") ||
      commandNames.has("write_file"),
  );
  const checksEnabled = commandNames.has("run_check");

  const features: ToolFeature[] = [
    {
      title: "Pursue Goal",
      description: "Run a persistent agent loop until a task is complete or blocked.",
      enabled: canChat,
      detail: canChat ? "Agent loop" : "Chat scope required",
      href: canChat ? "/goal" : undefined,
      icon: Target,
    },
    {
      title: "Signed Commands",
      description: "Manifest-driven remote development commands with device keys.",
      enabled: canUseCommands && commandCatalog.length > 0,
      detail: `${commandCatalog.length} commands`,
      href: "/commands",
      icon: ShieldCheck,
    },
    {
      title: "Workspace Files",
      description: "Browse or edit workspace files through signed commands.",
      enabled: canUseCommands && workspaceFilesEnabled,
      detail: workspaceFilesEnabled ? "Command catalog" : "Not advertised",
      href: workspaceFilesEnabled ? "/commands" : undefined,
      icon: Folder,
    },
    {
      title: "Run Checks",
      description: "Trigger approved checks without raw shell access.",
      enabled: canUseCommands && checksEnabled,
      detail: checksEnabled ? "run_check" : "Not advertised",
      href: checksEnabled ? "/commands" : undefined,
      icon: Wrench,
    },
    {
      title: "Raw Terminal",
      description: "Agent-mode bash access for code changes, git work, and deploy steps.",
      enabled: canUseCommands && rawShellEnabled,
      detail: rawShellEnabled ? "Remote development scope" : "Not advertised",
      href: rawShellEnabled ? "/goal" : undefined,
      icon: TerminalSquare,
    },
    {
      title: "Attachments",
      description: "Phone camera, gallery, and file uploads for chat context.",
      enabled: endpointAvailable(endpointPaths, "/upload"),
      detail: endpointAvailable(endpointPaths, "/upload")
        ? "Endpoint advertised"
        : "Endpoint not advertised",
      icon: Paperclip,
    },
    {
      title: "Voice",
      description: "Speech-to-text capture for chat messages.",
      enabled: endpointAvailable(endpointPaths, "/stt"),
      detail: endpointAvailable(endpointPaths, "/stt")
        ? "Endpoint advertised"
        : "Endpoint not advertised",
      icon: Mic,
    },
    {
      title: "Email",
      description: "Owner-scoped mail browsing, summarizing, and replies.",
      enabled: endpointAvailable(endpointPaths, "/email"),
      detail: endpointAvailable(endpointPaths, "/email")
        ? "Endpoint advertised"
        : "Endpoint not advertised",
      icon: Mail,
    },
    {
      title: "Calendar",
      description: "Read and create calendar events through companion routes.",
      enabled: endpointAvailable(endpointPaths, "/calendar"),
      detail: endpointAvailable(endpointPaths, "/calendar")
        ? "Endpoint advertised"
        : "Endpoint not advertised",
      icon: CalendarDays,
    },
    {
      title: "Notes",
      description: "Capture and search notes from the phone client.",
      enabled: endpointAvailable(endpointPaths, "/notes"),
      detail: endpointAvailable(endpointPaths, "/notes")
        ? "Endpoint advertised"
        : "Endpoint not advertised",
      icon: StickyNote,
    },
    {
      title: "Tasks",
      description: "Create and review lightweight task lists.",
      enabled: endpointAvailable(endpointPaths, "/tasks"),
      detail: endpointAvailable(endpointPaths, "/tasks")
        ? "Endpoint advertised"
        : "Endpoint not advertised",
      icon: ListTodo,
    },
  ];

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 py-5 gap-5 android:pb-safe"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Icon icon={Wrench} className="h-5 w-5 text-foreground" />
        </View>
        <View className="flex-1">
          <Text className="text-xl font-semibold text-foreground">Tools</Text>
          <Text className="text-sm text-muted-foreground">
            Backend-advertised companion capabilities
          </Text>
        </View>
      </View>

      <View className="gap-3">
        {features.map((feature) => (
          <FeatureRow key={feature.title} feature={feature} />
        ))}
      </View>
    </ScrollView>
  );
}

function FeatureRow({ feature }: { feature: ToolFeature }) {
  const body = (
    <Pressable
      disabled={!feature.enabled || !feature.href}
      className={cn(
        "rounded-[18px] border p-4 active:bg-muted disabled:opacity-70 border-continuous",
        feature.enabled ? "border-border bg-card" : "border-border bg-muted/30",
      )}
    >
      <View className="flex-row items-start gap-3">
        <View
          className={cn(
            "h-10 w-10 items-center justify-center rounded-full",
            feature.enabled ? "bg-foreground" : "bg-muted",
          )}
        >
          <Icon
            icon={feature.enabled ? Check : feature.icon}
            className={cn(
              "h-4 w-4",
              feature.enabled ? "text-background" : "text-muted-foreground",
            )}
          />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="min-w-0 flex-1 text-base font-semibold text-foreground">
              {feature.title}
            </Text>
            <Text
              className={cn(
                "rounded-full px-2 py-1 text-[11px] font-semibold",
                feature.enabled
                  ? "bg-foreground/10 text-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {feature.enabled ? "Available" : "Unavailable"}
            </Text>
          </View>
          <Text className="text-sm leading-5 text-muted-foreground">
            {feature.description}
          </Text>
          <Text className="font-mono text-xs text-muted-foreground">
            {feature.detail}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  if (!feature.enabled || !feature.href) return body;
  return (
    <Link href={feature.href as any} asChild>
      {body}
    </Link>
  );
}
