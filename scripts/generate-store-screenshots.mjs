#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const extraModulePath = process.env.EXTRA_NODE_MODULES;
const sharpPath = (() => {
  try {
    return require.resolve("sharp", {
      paths: [process.cwd(), extraModulePath].filter(Boolean),
    });
  } catch {
    throw new Error(
      "sharp is required. Install it locally or run with EXTRA_NODE_MODULES pointing to a node_modules directory that contains sharp.",
    );
  }
})();
const sharp = require(sharpPath);

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const locale = "en-US";
const outputRoot = path.join(root, "store", "apple", "screenshot", locale);

const displayTypes = [
  { type: "APP_IPHONE_67", width: 1290, height: 2796 },
  { type: "APP_IPHONE_65", width: 1242, height: 2688 },
];

const colors = {
  bg: "#282c34",
  panel: "#313640",
  panel2: "#252932",
  line: "#46505c",
  text: "#f5f7fb",
  muted: "#aab8c7",
  dim: "#81919f",
  coral: "#e06c75",
  cyan: "#a7e4ff",
  green: "#98c379",
  gold: "#e5c07b",
};

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logo(x, y, size, opacity = 1) {
  const p = (d) => `<path d="${d}" fill="${colors.coral}" opacity="${opacity}"/>`;
  return `<g transform="translate(${x} ${y}) scale(${size / 32})">
    ${p("M16 4L16 22L6 22Z")}
    <path d="M16 8L16 22L24 22Z" fill="${colors.coral}" opacity="${0.6 * opacity}"/>
    <path d="M4 24Q10 20 16 24Q22 28 28 24" stroke="${colors.coral}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="${opacity}"/>
  </g>`;
}

function text({ x, y, value, size = 42, weight = 500, fill = colors.text, anchor = "start" }) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="-apple-system, BlinkMacSystemFont, SF Pro Display, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(value)}</text>`;
}

function wrappedText({ x, y, width, value, size = 36, lineHeight = 48, fill = colors.muted, weight = 400 }) {
  const words = value.split(/\s+/);
  const lines = [];
  let current = "";
  const approx = size * 0.52;
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length * approx > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return `<text x="${x}" y="${y}" font-family="-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">
    ${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join("")}
  </text>`;
}

function rect(x, y, width, height, radius = 28, fill = colors.panel, stroke = colors.line) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
}

function pill(x, y, label, fill = colors.panel2, textFill = colors.cyan) {
  const width = 28 + label.length * 17;
  return `<g>${rect(x, y, width, 52, 26, fill, colors.line)}${text({ x: x + width / 2, y: y + 36, value: label, size: 24, weight: 700, fill: textFill, anchor: "middle" })}</g>`;
}

function statusBar(w) {
  return `<g>
    ${text({ x: 92, y: 82, value: "9:41", size: 36, weight: 700 })}
    <rect x="${w - 178}" y="47" width="48" height="28" rx="8" fill="${colors.text}" opacity="0.88"/>
    <rect x="${w - 122}" y="45" width="56" height="32" rx="9" fill="none" stroke="${colors.text}" stroke-width="4"/>
    <rect x="${w - 60}" y="54" width="5" height="14" rx="2" fill="${colors.text}"/>
    <text x="${w - 94}" y="69" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="${colors.text}">84</text>
  </g>`;
}

function frame({ w, h, title, subtitle, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#303641"/>
        <stop offset="0.58" stop-color="#282c34"/>
        <stop offset="1" stop-color="#17191f"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.8" cy="0.05" r="0.72">
        <stop offset="0" stop-color="#e06c75" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#e06c75" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    ${statusBar(w)}
    ${logo(76, 136, 84)}
    ${text({ x: 180, y: 188, value: "Odysseus", size: 52, weight: 800, fill: colors.text })}
    ${text({ x: 180, y: 236, value: subtitle, size: 28, weight: 500, fill: colors.muted })}
    ${text({ x: 76, y: 356, value: title, size: 64, weight: 800, fill: colors.cyan })}
    ${body}
  </svg>`;
}

function pairingScreen(w, h) {
  const body = `
    ${wrappedText({ x: 76, y: 424, width: w - 152, value: "Scan or paste the admin-generated companion payload to unlock scoped chat and signed commands.", size: 34 })}
    ${rect(76, 590, w - 152, 610, 36, "#111318", "#3e4651")}
    <rect x="${w / 2 - 180}" y="760" width="360" height="360" rx="46" fill="none" stroke="${colors.text}" stroke-width="7" opacity="0.86"/>
    <path d="M${w / 2 - 116} 828h80v80h-80zM${w / 2 + 36} 828h80v80h-80zM${w / 2 - 116} 980h80v80h-80z" fill="${colors.text}" opacity="0.78"/>
    <path d="M${w / 2 + 40} 988h28v28h-28zM${w / 2 + 88} 988h28v76h-28zM${w / 2 + 40} 1040h28v24h-28z" fill="${colors.coral}" opacity="0.9"/>
    ${text({ x: w / 2, y: 1168, value: "QR scanner ready", size: 30, weight: 700, fill: colors.text, anchor: "middle" })}
    ${rect(76, 1280, w - 152, 470, 34)}
    ${text({ x: 118, y: 1352, value: "Pairing Payload", size: 36, weight: 800 })}
    ${pill(w - 238, 1314, "HTTPS")}
    <rect x="118" y="1400" width="${w - 236}" height="196" rx="24" fill="${colors.bg}" stroke="${colors.line}" stroke-width="2"/>
    ${wrappedText({ x: 148, y: 1462, width: w - 296, value: '{"v":1,"host":"192.168.1.10","port":7000,"token":"ody_..."}', size: 28, lineHeight: 38, fill: colors.dim })}
    <rect x="118" y="1630" width="${w - 236}" height="88" rx="24" fill="${colors.text}" opacity="0.96"/>
    ${text({ x: w / 2, y: 1688, value: "Pair Device", size: 30, weight: 800, fill: colors.bg, anchor: "middle" })}
    ${rect(76, 1840, w - 152, 230, 34)}
    ${text({ x: 118, y: 1910, value: "Local network aware", size: 32, weight: 800 })}
    ${wrappedText({ x: 118, y: 1962, width: w - 236, value: "Use HTTP for trusted same-network devices or HTTPS for trusted Odysseus origins.", size: 28, lineHeight: 40 })}
  `;
  return frame({ w, h, title: "Pair securely", subtitle: "Private companion client", body });
}

function chatScreen(w, h) {
  const body = `
    ${pill(76, 420, "Session active", "#20313a", colors.cyan)}
    ${pill(340, 420, "Claude Sonnet", "#352f22", colors.gold)}
    ${rect(76, 530, w - 152, 270, 36)}
    ${text({ x: 118, y: 600, value: "User", size: 28, weight: 800, fill: colors.coral })}
    ${wrappedText({ x: 118, y: 656, width: w - 236, value: "Draft the deploy checklist for this Odysseus companion build.", size: 34, lineHeight: 46, fill: colors.text })}
    ${rect(76, 860, w - 152, 560, 36)}
    ${text({ x: 118, y: 930, value: "Odysseus", size: 28, weight: 800, fill: colors.cyan })}
    ${wrappedText({ x: 118, y: 992, width: w - 236, value: "Production assets are generated, dependency checks pass, persistent sessions are enabled, and the iOS App Store build is ready for upload.", size: 34, lineHeight: 48, fill: colors.text })}
    <rect x="118" y="1240" width="${w - 236}" height="18" rx="9" fill="${colors.line}"/>
    <rect x="118" y="1240" width="${Math.round((w - 236) * 0.76)}" height="18" rx="9" fill="${colors.coral}"/>
    ${text({ x: 118, y: 1322, value: "Streaming in background", size: 28, weight: 700, fill: colors.green })}
    ${rect(76, 1500, w - 152, 300, 36)}
    ${text({ x: 118, y: 1570, value: "Persistent session state", size: 34, weight: 800 })}
    ${wrappedText({ x: 118, y: 1628, width: w - 236, value: "Messages stay with the active session across tab switches, app changes, and stream resume.", size: 30, lineHeight: 42 })}
    <rect x="76" y="${h - 350}" width="${w - 152}" height="132" rx="36" fill="#1b1e25" stroke="${colors.line}" stroke-width="2"/>
    ${text({ x: 124, y: h - 270, value: "Ask Odysseus anything...", size: 32, weight: 500, fill: colors.dim })}
    <circle cx="${w - 146}" cy="${h - 284}" r="42" fill="${colors.coral}"/>
    <path d="M${w - 162} ${h - 284}h32M${w - 146} ${h - 300}l16 16-16 16" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  `;
  return frame({ w, h, title: "Continue every chat", subtitle: "Sessions survive context switches", body });
}

function commandsScreen(w, h) {
  const command = (y, name, detail, state, color) => `
    ${rect(76, y, w - 152, 204, 32)}
    ${text({ x: 118, y: y + 62, value: name, size: 34, weight: 800 })}
    ${wrappedText({ x: 118, y: y + 114, width: w - 330, value: detail, size: 27, lineHeight: 36 })}
    ${pill(w - 260, y + 68, state, "#202833", color)}
  `;
  const body = `
    ${wrappedText({ x: 76, y: 424, width: w - 152, value: "Commands come from the paired server manifest and are signed with a device-held key before execution.", size: 34 })}
    ${rect(76, 580, w - 152, 260, 36)}
    ${text({ x: 118, y: 650, value: "Device signing key", size: 34, weight: 800 })}
    ${wrappedText({ x: 118, y: 708, width: w - 236, value: "Private key material stays on device. Command requests include Odysseus signature headers.", size: 30, lineHeight: 42 })}
    ${pill(118, 764, "Registered", "#213325", colors.green)}
    ${command(930, "Refresh manifest", "Fetch latest server capabilities and command catalog.", "Ready", colors.green)}
    ${command(1180, "Run maintenance", "Execute a signed trusted command with typed inputs.", "Signed", colors.cyan)}
    ${command(1430, "Stop active stream", "Cancel or detach an active companion prompt.", "Scoped", colors.gold)}
    ${rect(76, 1728, w - 152, 250, 36, "#2b2528", "#56414a")}
    ${text({ x: 118, y: 1798, value: "Owner-scoped control", size: 34, weight: 800, fill: colors.coral })}
    ${wrappedText({ x: 118, y: 1856, width: w - 236, value: "The server decides which commands are visible to this paired token.", size: 30, lineHeight: 42 })}
  `;
  return frame({ w, h, title: "Run signed commands", subtitle: "Manifest-driven controls", body });
}

function settingsScreen(w, h) {
  const row = (y, label, value) => `
    <line x1="118" y1="${y - 34}" x2="${w - 118}" y2="${y - 34}" stroke="${colors.line}" stroke-width="2"/>
    ${text({ x: 118, y, value: label, size: 28, weight: 700, fill: colors.muted })}
    ${text({ x: w - 118, y, value, size: 28, weight: 800, fill: colors.text, anchor: "end" })}
  `;
  const body = `
    ${rect(76, 420, w - 152, 420, 36)}
    ${text({ x: 118, y: 496, value: "Companion server", size: 38, weight: 800 })}
    ${wrappedText({ x: 118, y: 560, width: w - 236, value: "Pair to a local network server or a trusted HTTPS Odysseus origin.", size: 32, lineHeight: 44 })}
    ${pill(118, 720, "Connected", "#213325", colors.green)}
    ${pill(350, 720, "TLS optional", "#332c22", colors.gold)}
    ${rect(76, 930, w - 152, 470, 36)}
    ${text({ x: 118, y: 1006, value: "Capabilities", size: 38, weight: 800 })}
    ${row(1106, "Chat streaming", "Enabled")}
    ${row(1196, "Session history", "Persistent")}
    ${row(1286, "Signed commands", "Enabled")}
    ${rect(76, 1490, w - 152, 330, 36)}
    ${text({ x: 118, y: 1566, value: "Privacy-first by design", size: 38, weight: 800 })}
    ${wrappedText({ x: 118, y: 1630, width: w - 236, value: "No hosted analytics or advertising SDK is included. Camera access is used only for pairing QR codes.", size: 32, lineHeight: 46 })}
    ${logo(w - 220, h - 390, 144, 0.9)}
    ${text({ x: 76, y: h - 240, value: "Odysseus", size: 58, weight: 800, fill: colors.text })}
    ${text({ x: 76, y: h - 190, value: "Private companion workflows", size: 30, weight: 600, fill: colors.muted })}
  `;
  return frame({ w, h, title: "Configure with clarity", subtitle: "Server, capabilities, privacy", body });
}

const screens = [
  ["01-pairing.png", pairingScreen],
  ["02-chat.png", chatScreen],
  ["03-commands.png", commandsScreen],
  ["04-settings.png", settingsScreen],
];

for (const display of displayTypes) {
  const outputDir = path.join(outputRoot, display.type);
  await fs.mkdir(outputDir, { recursive: true });
  for (const [fileName, render] of screens) {
    const svg = render(display.width, display.height);
    await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, fileName));
  }
}
