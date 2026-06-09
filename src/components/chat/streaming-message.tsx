import { splitThinking } from "@/utils/thinking";
import { useEffect, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { StreamingStore } from "./streaming-store";
import { ThinkingBlock } from "./thinking-block";

export function StreamingMessage({
  store,
  statusLabel,
}: {
  store: StreamingStore;
  statusLabel?: string;
}) {
  const text = useSyncExternalStore(store.subscribe, store.get);
  const { answer, thinking } = splitThinking(text || "");
  const visibleAnswer = answer || (!thinking ? text : "");
  const isWaiting = !visibleAnswer.trim() && !thinking.trim();

  return (
    <View className="gap-2">
      <ThinkingBlock thinking={thinking} defaultOpen live />
      {isWaiting ? (
        <LiveStreamPlaceholder statusLabel={statusLabel} />
      ) : (
        <Text
          className={
            process.env.EXPO_OS === "web"
              ? "text-[13px] leading-[1.65] text-foreground"
              : "text-base leading-[22px] text-foreground"
          }
        >
          {visibleAnswer}
          <Text className="opacity-40">{"\u258C"}</Text>
        </Text>
      )}
    </View>
  );
}

function waitingLabel(statusLabel?: string) {
  const cleaned = statusLabel?.trim();
  if (!cleaned || cleaned === "Streaming") return "Thinking";
  if (cleaned.startsWith("Streaming ")) {
    return `Thinking with ${cleaned.slice("Streaming ".length)}`;
  }
  return cleaned;
}

function LiveStreamPlaceholder({ statusLabel }: { statusLabel?: string }) {
  return (
    <View className="self-start flex-row items-center gap-3 rounded-2xl border border-border bg-muted/35 px-3 py-2.5 border-continuous">
      <View className="h-5 flex-row items-center gap-1.5">
        <TypingDot delayMs={0} />
        <TypingDot delayMs={120} />
        <TypingDot delayMs={240} />
      </View>
      <Text
        numberOfLines={1}
        className="max-w-64 text-sm font-medium text-muted-foreground"
      >
        {waitingLabel(statusLabel)}
      </Text>
    </View>
  );
}

function TypingDot({ delayMs }: { delayMs: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 420,
            easing: Easing.out(Easing.cubic),
          }),
          withTiming(0, {
            duration: 520,
            easing: Easing.in(Easing.cubic),
          }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      progress.value = 0;
    };
  }, [delayMs, progress]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [
      { translateY: -3 * progress.value },
      { scale: 0.78 + progress.value * 0.28 },
    ],
  }));

  return (
    <Animated.View
      style={dotStyle}
      className="h-1.5 w-1.5 rounded-full bg-foreground"
    />
  );
}
