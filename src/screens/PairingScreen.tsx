import { Icon } from "@/components/icon";
import { useCompanion } from "@/state/companion-store";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, KeyRound, ShieldAlert, Wifi } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

export function PairingScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [payload, setPayload] = useState("");
  const [useHttps, setUseHttps] = useState(false);
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [error, setError] = useState<string>();
  const { pairFromPayload } = useCompanion();

  const pair = useCallback(
    async (nextPayload = payload) => {
      try {
        setError(undefined);
        await pairFromPayload(nextPayload, useHttps ? "https" : "http");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid pairing payload");
        setScannerEnabled(false);
      }
    },
    [pairFromPayload, payload, useHttps],
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      contentContainerClassName="px-5 py-6 gap-5 android:pb-safe"
    >
      <View className="gap-2">
        <Text className="font-mono text-3xl font-semibold text-foreground">
          Odysseus
        </Text>
        <Text className="text-base leading-6 text-muted-foreground">
          Pair with the admin-generated companion payload to unlock scoped chat
          and signed commands.
        </Text>
      </View>

      <View className="overflow-hidden rounded-[18px] border border-border bg-card border-continuous">
        {permission?.granted && scannerEnabled ? (
          <CameraView
            className="h-72 w-full"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              setScannerEnabled(false);
              setPayload(data);
              pair(data);
            }}
          />
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
          placeholder='{"v":1,"host":"192.168.1.10","port":7000,"token":"ody_..."}'
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
            ? "HTTPS transport selected. Keep using only trusted Odysseus origins."
            : "HTTP transport is intended for a trusted same-network development device."}
        </Text>
      </View>

      {error && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3"
        >
          <Text selectable className="text-sm text-red-500">
            {error}
          </Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}
