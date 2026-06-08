import { Icon } from "@/components/icon";
import { cn } from "@/utils/tailwind";
import { Bot, Globe, Search, TerminalSquare } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

export type ChatOptions = {
  agent: boolean;
  web: boolean;
  terminal: boolean;
  research: boolean;
};

export const DEFAULT_CHAT_OPTIONS: ChatOptions = {
  agent: false,
  web: false,
  terminal: false,
  research: false,
};

export function normalizeChatOptions(
  current: ChatOptions,
  patch: Partial<ChatOptions>,
) {
  const next = { ...current, ...patch };

  if (patch.research !== undefined) {
    if (next.research) {
      next.agent = false;
      next.terminal = false;
      next.web = false;
    }
  } else if (next.agent || next.web || next.terminal) {
    next.research = false;
  }

  if (next.terminal) next.agent = true;
  if (!next.agent) next.terminal = false;

  return next;
}

export function ToolToggles({
  value,
  onChange,
  disabled,
  terminalAvailable,
}: {
  value: ChatOptions;
  onChange: (next: ChatOptions) => void;
  disabled?: boolean;
  terminalAvailable?: boolean;
}) {
  function set(patch: Partial<ChatOptions>) {
    onChange(normalizeChatOptions(value, patch));
  }

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Chip
        icon={Bot}
        label="Agent"
        active={value.agent}
        disabled={disabled}
        onPress={() => set({ agent: !value.agent })}
      />
      <Chip
        icon={Globe}
        label="Web"
        active={value.web}
        disabled={disabled}
        onPress={() => set({ web: !value.web })}
      />
      <Chip
        icon={TerminalSquare}
        label="Terminal"
        active={value.terminal}
        disabled={disabled || !terminalAvailable}
        onPress={() => set({ terminal: !value.terminal })}
      />
      <Chip
        icon={Search}
        label="Research"
        active={value.research}
        disabled={disabled}
        onPress={() => set({ research: !value.research })}
      />
    </View>
  );
}

function Chip({
  active,
  disabled,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "h-8 flex-row items-center gap-1.5 rounded-full border px-3 active:bg-muted disabled:opacity-40",
        active ? "border-foreground bg-foreground" : "border-border bg-card",
      )}
    >
      <Icon
        icon={icon}
        className={cn("h-3.5 w-3.5", active ? "text-background" : "text-foreground")}
      />
      <Text
        className={cn(
          "text-xs font-semibold",
          active ? "text-background" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
