export const odysseusTheme = {
  bg: "#282c34",
  fg: "#9cdef2",
  panel: "#111111",
  panelAlt: "#1b2028",
  border: "#355a66",
  muted: "#6f8790",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
} as const;

export type OdysseusThemeColor = keyof typeof odysseusTheme;
