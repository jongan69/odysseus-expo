import { Icon } from "@/components/icon";
import { cn } from "@/utils/tailwind";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

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
  const elapsedSeconds = useLiveElapsed(live && Boolean(trimmed));

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
          <View className="flex-row items-center gap-1.5 rounded-full bg-foreground/10 px-2 py-0.5">
            <LiveDot />
            <Text className="text-[11px] font-semibold text-muted-foreground">
              {elapsedSeconds.toFixed(1)}s
            </Text>
          </View>
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

function useLiveElapsed(enabled: boolean) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds((Date.now() - startedAt) / 1000);
    }, 100);

    return () => clearInterval(interval);
  }, [enabled]);

  return enabled ? elapsedSeconds : 0;
}

function LiveDot() {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 450,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(0.35, {
          duration: 450,
          easing: Easing.in(Easing.cubic),
        }),
      ),
      -1,
      false,
    );

    return () => {
      opacity.value = 0.35;
    };
  }, [opacity]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={dotStyle}
      className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
    />
  );
}
