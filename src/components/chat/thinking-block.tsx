import { Icon } from "@/components/icon";
import { cn } from "@/utils/tailwind";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

export function ThinkingBlock({
  thinking,
  defaultOpen = false,
  live = false,
}: {
  thinking: string;
  defaultOpen?: boolean;
  live?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const trimmed = thinking.trim();

  if (!trimmed) return null;

  return (
    <View className="overflow-hidden rounded-xl border border-border bg-muted/40 border-continuous">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
      >
        <Icon
          icon={open ? ChevronDown : ChevronRight}
          className="h-4 w-4 text-muted-foreground"
        />
        <Text className="flex-1 text-sm font-semibold text-muted-foreground">
          Thinking
        </Text>
        {live && (
          <Text className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Live
          </Text>
        )}
      </Pressable>
      {open && (
        <Text
          selectable
          className={cn(
            "border-t border-border px-3 py-3 font-mono text-xs leading-5 text-muted-foreground",
            process.env.EXPO_OS === "web" && "whitespace-pre-wrap",
          )}
        >
          {trimmed}
        </Text>
      )}
    </View>
  );
}
