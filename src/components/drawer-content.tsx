import "@/global.css";

import { Icon } from "@/components/icon";
import { TouchableGlass } from "@/components/touchable-glass";
import { SafeAreaView } from "@/components/tw";
import { useCompanion } from "@/state/companion-store";
import { cn } from "@/utils/tailwind";
import type { Href } from "expo-router";
import {
  KeyRound,
  MessageSquarePlus,
  Plus,
  Server,
  TerminalSquare,
  Wrench,
} from "lucide-react-native";

import React, { createContext, use, useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type DrawerContextValue = {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  return (
    <DrawerContext value={{ isOpen, openDrawer, closeDrawer }}>
      {children}
    </DrawerContext>
  );
}

export function useDrawer() {
  const context = use(DrawerContext);
  if (!context) {
    throw new Error("useDrawer must be used within a DrawerProvider");
  }
  return context;
}

function DrawerNavItem({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-2 flex-row items-center gap-3 rounded-[10px] px-4 py-3 active:bg-muted"
    >
      {icon && <Icon icon={icon as any} className="h-4 w-4 text-foreground" />}
      <Text className="text-base text-foreground">
        {label}
      </Text>
    </Pressable>
  );
}

function DrawerChatItem({
  title,
  onPress,
  active,
}: {
  title: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        `px-4 py-2.5 mx-2 rounded-[10px] active:bg-accent`,
        active && "bg-muted",
      )}
    >
      <Text
        numberOfLines={1}
        className={cn(
          `text-[15px]`,
          active
            ? "text-foreground"
            : "text-muted-foreground",
        )}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function DrawerContent({
  onNavigate,
  onOpenModal,
}: {
  onNavigate: (path: Href) => void;
  onOpenModal: (path: Href) => void;
}) {
  const { sessions, activeSessionId, setActiveSessionId, manifest, status } =
    useCompanion();
  const initials = (manifest?.owner || "OD")
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView
      // NOTE: Some issue with uniwind that prevents updates for this component.
      className="flex-1"
      edges={["top", "bottom", "left"]}
    >
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <Text className="font-mono text-[28px] font-bold text-foreground">
          Odysseus
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {status === "paired" ? "Companion connected" : "Pair a device"}
        </Text>
      </View>

      {/* Nav + Chat history */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        <DrawerNavItem
          icon={MessageSquarePlus}
          label="Chat"
          onPress={() => onNavigate("/")}
        />
        <DrawerNavItem
          icon={Server}
          label="Sessions"
          onPress={() => onNavigate("/chats")}
        />
        <DrawerNavItem
          icon={TerminalSquare}
          label="Commands"
          onPress={() => onNavigate("/commands")}
        />
        <DrawerNavItem
          icon={Wrench}
          label="Tools"
          onPress={() => onNavigate("/tools" as any)}
        />
        <DrawerNavItem
          icon={KeyRound}
          label="Settings"
          onPress={() => {
            if (process.env.EXPO_OS === "android") {
              onNavigate("/(settings)/settings");
            }
            onOpenModal("/(settings)/settings");
          }}
        />

        {/* Recents */}
        <Text className="text-[13px] font-semibold text-muted-foreground px-6 pt-5 pb-1.5">
          Sessions
        </Text>
        {sessions.map((session) => (
          <DrawerChatItem
            key={session.id}
            title={session.name || session.model || "Companion"}
            active={session.id === activeSessionId}
            onPress={() => {
              setActiveSessionId(session.id);
              onNavigate("/");
            }}
          />
        ))}
      </ScrollView>

      {/* Footer */}
      <View
        className="flex-row items-center px-4 py-3 border-t border-border"
        style={{ borderTopWidth: StyleSheet.hairlineWidth }}
      >
        <TouchableGlass
          onPress={() => onOpenModal("/(settings)/settings")}
          className="rounded-full p-2 flex-row items-center gap-2.5 active:opacity-60"
        >
          <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
            <Text className="font-mono text-[13px] font-semibold text-foreground">
              {initials || "OD"}
            </Text>
          </View>
          <Text className="text-sm text-foreground" numberOfLines={1}>
            {manifest?.owner ?? "Odysseus"}
          </Text>
        </TouchableGlass>
        <View className="flex-1" />
        <TouchableGlass
          onPress={() => onNavigate("/")}
          className="w-10 h-10 rounded-full bg-foreground active:bg-muted items-center justify-center"
        >
          <Icon
            icon={Plus}
            className="w-6 h-6 text-background"
          />
        </TouchableGlass>
      </View>
    </SafeAreaView>
  );
}
