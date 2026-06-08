import { useCompanion } from "@/state/companion-store";
import {
  Button,
  Host,
  HStack,
  Menu,
  Section,
  Image as SUIImage,
  Text as SUIText,
  VStack,
} from "@expo/ui/swift-ui";
import {
  controlSize,
  font,
  foregroundStyle,
} from "@expo/ui/swift-ui/modifiers";
import { Stack, useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import { useDrawer } from "./drawer-content";

function HeaderTitleMenu() {
  const { activeSession, selectedModel, status } = useCompanion();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const headerFg = isDark ? "#fff" : "#000";
  const headerFgMuted = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)";

  const title = activeSession?.model || selectedModel || "Odysseus";
  const subtitle = activeSession?.name || (status === "paired" ? "Companion" : "Pair");
  return (
    <Host
      style={{
        minWidth: 120,
        minHeight: 40,
      }}
    >
      <Menu
        label={
          <VStack spacing={0}>
            <HStack spacing={4} alignment="center">
              <SUIText
                modifiers={[
                  foregroundStyle(headerFg),
                  font({ weight: "semibold", size: 17 }),
                ]}
              >
                {title}
              </SUIText>
              <SUIImage systemName="chevron.down" size={10} color={headerFg} />
            </HStack>
            {subtitle && (
              <SUIText
                modifiers={[foregroundStyle(headerFgMuted), font({ size: 12 })]}
              >
                {subtitle}
              </SUIText>
            )}
          </VStack>
        }
        modifiers={[controlSize("regular")]}
      >
        <Section title="Odysseus">
          <Button
            systemImage="server.rack"
            label="Session"
            onPress={() => router.navigate("/session")}
          />
          <Button
            systemImage="terminal"
            label="Commands"
            onPress={() => router.navigate("/commands")}
          />
          <Button
            systemImage="wrench.and.screwdriver"
            label="Tools"
            onPress={() => router.navigate("/tools" as any)}
          />
        </Section>
      </Menu>
    </Host>
  );
}

export function MainHeader() {
  const { openDrawer } = useDrawer();
  const router = useRouter();
  return (
    <>
      <Stack.Screen.Title asChild>
        <HeaderTitleMenu />
      </Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="terminal"
          onPress={() => router.navigate("/commands")}
        />
      </Stack.Toolbar>
    </>
  );
}
