import { SymbolImage } from "@/components/symbol-image";
import { TouchableGlass } from "@/components/touchable-glass";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { cn } from "@/utils/tailwind";
import { BlurView } from "expo-blur";
import { useChatContext } from "./chat-context";
import { useConversationContext } from "./conversation";

const AnimatedGlassContainer = Animated.createAnimatedComponent(GlassContainer);

/**
 * Root container for the message composer. Positions itself at the bottom of
 * the `<Conversation />` using the shared conversation context. Children are
 * laid out in a horizontal row inside a glass container.
 */
export function PromptInput({ children }: { children: ReactNode }) {
  const { promptInputStyle, onPromptInputLayout } = useConversationContext();
  const { error } = useChatContext();
  const accessories: ReactNode[] = [];
  const controls: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (isValidElement(child) && (child.type as any) === PromptInputAccessory) {
      accessories.push(child);
    } else {
      controls.push(child);
    }
  });

  return (
    <Animated.View
      onLayout={onPromptInputLayout}
      style={[{ position: "absolute", left: 0, right: 0 }, promptInputStyle]}
    >
      {error && <PromptInputError message={error.message} />}
      <AnimatedGlassContainer
        style={{
          flex: 1,
          flexDirection: "column",
          padding: 12,
          gap: 10,
        }}
        spacing={8}
      >
        {accessories.length > 0 && (
          <View className="w-full">{accessories}</View>
        )}
        <View className="w-full flex-row items-end gap-2.5">
          {controls}
        </View>
      </AnimatedGlassContainer>
    </Animated.View>
  );
}

export function PromptInputAccessory({ children }: { children: ReactNode }) {
  return <View className="w-full px-1 pb-1">{children}</View>;
}

function PromptInputError({ message }: { message?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} className="px-3 pb-2">
      <View
        className="flex-row items-center gap-2 rounded-xl bg-card px-3 py-2.5 border-continuous"
      >
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: "#EF4444" }}
        />
        <Text
          className="flex-1 text-xs text-muted-foreground"
          numberOfLines={2}
        >
          {message || "Something went wrong"}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * A circular glass button for actions (e.g. attachments, camera).
 */
export function PromptInputAction(props: {
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <TouchableGlass
      hitSlop={4}
      {...props}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
      }}
    />
  );
}

/**
 * Glass-wrapped container for the textarea and submit button.
 */
export function PromptInputBody({ children }: { children: ReactNode }) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        isInteractive
        glassEffectStyle="regular"
        className="border-continuous"
        style={{
          flex: 1,
          flexDirection: "row",

          borderRadius: 22,
        }}
      >
        {children}
      </GlassView>
    );
  }

  // TODO: Android version...
  return (
    <BlurView
      tint="systemChromeMaterial"
      className="border-continuous"
      style={{
        flex: 1,
        flexDirection: "row",

        overflow: "hidden",
        borderRadius: 22,
      }}
    >
      {children}
    </BlurView>
  );
}

/**
 * Auto-growing text input for composing messages. Reads/writes the current
 * input value from `ChatContext`.
 */
export function PromptInputTextarea({
  placeholder = "Chat with Odysseus...",
  maxLength = 1000,
}: {
  placeholder?: string;
  maxLength?: number;
}) {
  const { input, setInput } = useChatContext();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (input === "") {
      inputRef.current?.clear();
    }
  }, [input]);

  return (
    <TextInput
      ref={inputRef}
      nativeID="composer"
      style={{ fontSize: 16 }}
      className="flex-1 pl-4 pr-2 py-3 text-foreground max-h-25"
      value={input}
      onChangeText={setInput}
      placeholder={placeholder}
      multiline
      maxLength={maxLength}
    />
  );
}

/**
 * Submit button that sends the current input. Shows a spinner while the model
 * is generating. Reads state from `ChatContext`.
 */
export function PromptInputSubmit() {
  const { input, isGenerating, onSend, onStop } = useChatContext();
  const disabled = !input.trim() || isGenerating;

  return (
    <Pressable
      className={cn(
        "w-[34px] h-[34px] rounded-full m-[5px] items-center justify-center active:opacity-70",
        disabled && !isGenerating ? "bg-secondary" : "bg-foreground",
      )}
      onPress={isGenerating ? onStop : onSend}
      disabled={disabled && !isGenerating}
    >
      {isGenerating ? (
        <Animated.View entering={FadeIn} exiting={FadeOut}>
          {onStop ? (
            <SymbolImage
              name="stop.fill"
              size={13}
              sfEffect="scale/down"
              className="font-semibold text-background"
            />
          ) : (
            <ActivityIndicator
              size="small"
            />
          )}
        </Animated.View>
      ) : (
          <SymbolImage
            name="arrow.up"
            size={16}
            sfEffect="scale/up"
            className={cn(
              "font-semibold",
              disabled
                ? "text-muted-foreground"
                : "text-background",
            )}
          />
      )}
    </Pressable>
  );
}
