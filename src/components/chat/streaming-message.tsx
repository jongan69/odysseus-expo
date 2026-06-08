import { splitThinking } from "@/utils/thinking";
import { useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import type { StreamingStore } from "./streaming-store";
import { ThinkingBlock } from "./thinking-block";

export function StreamingMessage({ store }: { store: StreamingStore }) {
  const text = useSyncExternalStore(store.subscribe, store.get);
  const { answer, thinking } = splitThinking(text || "");
  const visibleAnswer = answer || (!thinking ? text : "");

  return (
    <View className="gap-2">
      <ThinkingBlock thinking={thinking} defaultOpen live />
      <Text
        className={
          process.env.EXPO_OS === "web"
            ? "text-[13px] leading-[1.65] text-foreground"
            : "text-base leading-[22px] text-foreground"
        }
      >
        {visibleAnswer || "..."}
        <Text className="opacity-40">{"\u258C"}</Text>
      </Text>
    </View>
  );
}
