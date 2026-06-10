import { Icon } from "@/components/icon";
import { useCompanion } from "@/state/companion-store";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  Camera,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Wifi,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

type PairingScreenProps = {
  title?: string;
  description?: string;
  onPaired?: () => void;
};

export function PairingScreen({
  title = "Odysseus",
  description = "Pair with the admin-generated companion payload to unlock scoped chat and signed commands.",
  onPaired,
}: PairingScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [payload, setPayload] = useState("");
  const [useHttps, setUseHttps] = useState(false);
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [isPairing, setIsPairing] = useState(false);
  const [error, setError] = useState<string>();
  const { pairFromPayload } = useCompanion();

  const pair = useCallback(
    async (nextPayload = payload) => {
      const trimmedPayload = nextPayload.trim();
      if (!trimmedPayload || isPairing) return;
      setScannerEnabled(false);
      setIsPairing(true);
      try {
        setError(undefined);
        await pairFromPayload(trimmedPayload, useHttps ? "https" : "http");
        onPaired?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid pairing payload");
      } finally {
        setIsPairing(false);
      }
    },
    [isPairing, onPaired, pairFromPayload, payload, useHttps],
  );

  const resumeScanner = useCallback(() => {
    setError(undefined);
    setScannerEnabled(true);
  }, []);

  const retryScan = useCallback(() => {
    setPayload("");
    resumeScanner();
  }, [resumeScanner]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      contentContainerClassName="px-5 py-6 gap-5 android:pb-safe"
    >
      <View className="gap-2">
        <Text className="font-mono text-3xl font-semibold text-foreground">
          {title}
        </Text>
        <Text className="text-base leading-6 text-muted-foreground">
          {description}
        </Text>
      </View>

      <View className="overflow-hidden rounded-[18px] border border-border bg-card border-continuous">
        {permission?.granted ? (
          <View className="h-72 w-full overflow-hidden bg-black">
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={
                scannerEnabled && !isPairing
                  ? ({ data }) => {
                      setPayload(data);
                      void pair(data);
                    }
                  : undefined
              }
            />
            <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
              <View className="h-40 w-40 rounded-[28px] border-2 border-white/80" />
            </View>
            {(isPairing || !scannerEnabled) && (
              <View className="absolute inset-x-4 bottom-4 rounded-xl bg-black/70 px-4 py-3">
                <Text className="text-center text-sm font-semibold text-white">
                  {isPairing
                    ? "Pairing with Odysseus"
                    : error
                      ? "Scan failed"
                      : "Scanner paused"}
                </Text>
                {!isPairing && (
                  <Pressable
                    onPress={retryScan}
                    className="mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 active:opacity-80"
                  >
                    <Icon icon={RefreshCw} className="h-4 w-4 text-black" />
                    <Text className="text-sm font-semibold text-black">Scan Again</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ) : (
          <View className="h-72 items-center justify-center gap-3 bg-muted px-8">
            <Icon icon={Camera} className="h-10 w-10 text-muted-foreground" />
            <Pressable
              onPress={requestPermission}
              className="rounded-full bg-foreground px-4 py-2.5 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-background">
                Enable Camera
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View className="gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
        <View className="flex-row items-center gap-3">
          <Icon icon={KeyRound} className="h-5 w-5 text-foreground" />
          <Text className="flex-1 text-base font-semibold text-foreground">
            Pairing Payload
          </Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-medium text-muted-foreground">
              HTTPS
            </Text>
            <Switch value={useHttps} onValueChange={setUseHttps} />
          </View>
        </View>
        <TextInput
          value={payload}
          onChangeText={setPayload}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder='{"v":1,"base_url":"https://odysseus.example.com","token":"ody_..."}'
          className="min-h-28 rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm text-foreground border-continuous"
          style={{ textAlignVertical: "top" }}
        />
        <Pressable
          onPress={() => pair()}
          disabled={!payload.trim()}
          className="items-center rounded-xl bg-foreground py-3 active:opacity-80 disabled:opacity-40 border-continuous"
        >
          <Text className="font-semibold text-background">Pair Device</Text>
        </Pressable>
      </View>

      <View className="flex-row gap-3 rounded-[18px] border border-border bg-card p-4 border-continuous">
        <Icon icon={useHttps ? Wifi : ShieldAlert} className="h-5 w-5 text-foreground" />
        <Text className="flex-1 text-sm leading-5 text-muted-foreground">
          {useHttps
            ? "HTTPS transport selected. Keep using only trusted Odysseus origins. For Tailscale ts.net hosts on macOS, use the full Tailscale app instead of a proxy-only/rootless daemon."
            : "HTTP transport is intended for a trusted same-network development device."}
        </Text>
      </View>

      {error && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          className="gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3"
        >
          <Text selectable className="text-sm text-red-500">
            {error}
          </Text>
          <Pressable
            onPress={retryScan}
            className="flex-row items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 active:bg-red-500/10"
          >
            <Icon icon={RefreshCw} className="h-4 w-4 text-red-500" />
            <Text className="text-sm font-semibold text-red-500">Retry Scan</Text>
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}
