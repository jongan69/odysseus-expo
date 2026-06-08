import { Icon } from "@/components/icon";
import { useCompanion } from "@/state/companion-store";
import { Link, Stack, useRouter } from "expo-router";
import { ChevronDown, Menu, TerminalSquare } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useDrawer } from "./drawer-content";

function HeaderTitleMenu() {
  const { activeSession, selectedModel, status } = useCompanion();
  const title = activeSession?.model || selectedModel || "Odysseus";
  const subtitle = activeSession?.name || (status === "paired" ? "Companion" : "Pair");

  return (
    <Link href="/session" asChild>
      <Pressable
        accessibilityRole="button"
        className="px-2 py-1 rounded-md active:bg-muted flex-col items-center self-center"
      >
        <View className="flex-row items-center gap-1">
          <Text className="text-[17px] font-semibold text-foreground">
            {title}
          </Text>
          <Icon icon={ChevronDown} className="w-3 h-3 text-foreground" />
        </View>
        {subtitle && (
          <Text className="text-[12px] text-muted-foreground">{subtitle}</Text>
        )}
      </Pressable>
    </Link>
  );
}

export function MainHeader() {
  const { openDrawer } = useDrawer();
  const router = useRouter();
  return (
    <>
      {process.env.EXPO_OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
        </Stack.Toolbar>
      ) : (
        // TODO: Migrate to unified Toolbar support for Android in SDK 56
        <Stack.Toolbar placement="left" asChild>
          <Pressable
            onPress={openDrawer}
            accessibilityLabel="Open drawer"
            accessibilityRole="button"
            className="p-2 -ml-1 active:opacity-60"
          >
            <Icon icon={Menu} className="w-6 h-6 text-foreground" />
          </Pressable>
        </Stack.Toolbar>
      )}

      <Stack.Screen.Title asChild>
        <HeaderTitleMenu />
      </Stack.Screen.Title>

      {process.env.EXPO_OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="terminal"
            onPress={() => router.navigate("/commands")}
          />
        </Stack.Toolbar>
      ) : (
        // TODO: Migrate to unified Toolbar support for Android in SDK 56
        <Stack.Toolbar placement="right" asChild>
          <Pressable
            onPress={() => router.navigate("/commands")}
            accessibilityLabel="Commands"
            accessibilityRole="button"
            className="p-2 -mr-1 active:opacity-60"
          >
            <Icon icon={TerminalSquare} className="w-6 h-6 text-foreground" />
          </Pressable>
        </Stack.Toolbar>
      )}
    </>
  );
}
