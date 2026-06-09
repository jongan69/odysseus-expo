import { Icon } from "@/components/icon";
import { copyTextToClipboard } from "@/utils/clipboard";
import { cn } from "@/utils/tailwind";
import { Check, Copy } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text } from "react-native";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  showLabel = false,
  className,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabled = !text.trim();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onPress = async () => {
    if (disabled) return;
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? copiedLabel : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "h-8 flex-row items-center justify-center gap-1.5 rounded-lg px-2 active:bg-muted",
        copied ? "bg-foreground/10" : "bg-transparent",
        disabled && "opacity-40",
        className,
      )}
    >
      <Icon
        icon={copied ? Check : Copy}
        className={cn(
          "h-4 w-4",
          copied ? "text-foreground" : "text-muted-foreground",
        )}
      />
      {showLabel && (
        <Text
          numberOfLines={1}
          className={cn(
            "text-xs font-medium",
            copied ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {copied ? copiedLabel : label}
        </Text>
      )}
    </Pressable>
  );
}
