import * as Clipboard from "expo-clipboard";

export async function copyTextToClipboard(text: string) {
  const value = text.trimEnd();
  if (!value.trim()) return false;
  await Clipboard.setStringAsync(value);
  return true;
}
