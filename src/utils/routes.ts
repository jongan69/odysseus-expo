import type { Href } from "expo-router";

export const appRoutes = {
  chat: "/",
  pairing: "/pairing",
  chats: "/chats",
  session: "/session",
  commands: "/commands",
  goal: "/goal",
  tools: "/tools",
  settings: "/settings",
} as const satisfies Record<string, Href>;
