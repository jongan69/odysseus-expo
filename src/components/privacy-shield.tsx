import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";

export function PrivacyShield() {
  const [shielded, setShielded] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setShielded(state !== "active");
    });
    return () => subscription.remove();
  }, []);

  if (!shielded) return null;

  return (
    <View className="absolute inset-0 z-[999] items-center justify-center bg-background">
      <Text className="font-mono text-lg font-semibold text-foreground">
        Odysseus
      </Text>
    </View>
  );
}
