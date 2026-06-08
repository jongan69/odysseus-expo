import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const actual = join(root, "node_modules", "@expo", "expo-modules-macros-plugin");
const expected = join(
  root,
  "node_modules",
  "expo-modules-core",
  "node_modules",
  "@expo",
  "expo-modules-macros-plugin",
);

if (!existsSync(actual)) {
  process.exit(0);
}

try {
  const existing = lstatSync(expected);
  if (!existing.isSymbolicLink()) {
    process.exit(0);
  }
  rmSync(expected);
} catch {
  // Missing path is expected on Bun's hoisted install layout.
}

mkdirSync(dirname(expected), { recursive: true });
symlinkSync(relative(dirname(expected), actual), expected, "dir");
