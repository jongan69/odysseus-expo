# Odysseus Companion

Odysseus Companion is a private mobile and web client for pairing with an
Odysseus server, chatting through owner-scoped sessions, and running
manifest-driven signed commands from a trusted device.

The app is built with Expo Router and supports iOS, Android, and web from the
same codebase. Native verification requires a custom Expo development build;
Expo Go is not supported for this project.

## Features

- QR and manual pairing with an admin-generated Odysseus companion payload
- Bearer-token access to the companion manifest, models, sessions, and chat
- Secure on-device storage for pairing state and command signing keys
- Server-sent event chat streaming with stop and resume support
- Session and model selection from the paired server's available endpoints
- Manifest-driven command catalog with Ed25519 request signing
- Native drawer navigation on mobile and a responsive sidebar on web
- iOS Liquid Glass support through `expo-glass-effect`
- Tailwind CSS v4 styling through Uniwind and OKLCH design tokens

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Expo SDK 56, React Native 0.85, React 19 |
| Navigation | Expo Router with routes under `src/app` |
| Styling | Uniwind, Tailwind CSS v4, `tailwind-merge` |
| Native UI | `@expo/ui`, `expo-glass-effect`, `expo-haptics`, `expo-secure-store` |
| Chat | Odysseus `/api/chat_stream` SSE client plus local streaming UI store |
| Commands | Ed25519 signatures via `tweetnacl` and manifest-defined command schemas |
| Web UI | Radix context/dropdown/tooltip primitives and Lucide icons |
| Markdown | Custom AST renderer with `mdast-util-from-markdown` and syntax highlighting |

## Requirements

- Bun for dependency installation and package scripts
- Node.js/npm available for `npx` verification and EAS metadata commands
- Xcode with an iOS simulator for Apple platform verification
- Android Studio with an emulator if you need Android verification
- A custom Expo development build; this project does not run in Expo Go
- A reachable Odysseus server with the companion API enabled
- An admin-generated pairing payload with `v`, `host`, `port`, and `token`
- Same-network HTTP access for local development, or a trusted HTTPS Odysseus
  origin for remote access

The paired Odysseus server must expose the companion manifest, model/session
discovery, chat stream, command key registry, and signed command endpoints used
by `src/api/odysseusClient.ts`.

Use `bunx expo install <package>` when adding Expo-managed dependencies so
versions stay aligned with the installed Expo SDK.

## Setup

Install dependencies with Bun:

```bash
bun install
```

`bun install` also runs `scripts/ensure-expo-macros-plugin.mjs`, which repairs
the hoisted Expo macros plugin path needed by the generated iOS project.

Local environment settings are optional for the companion app itself. The
mobile companion flow talks to the Odysseus server you pair with, so you do not
need an Anthropic key just to run the native client.

Create `.env` only if you plan to use the local Expo API route or server output:

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Used only by the local `src/app/api/chat+api.ts` Expo API route. The main companion chat flow talks to the paired Odysseus server. |
| `EXPO_UNSTABLE_DEPLOY_SERVER` | Enables Expo server output/API route behavior when required by the target environment. |

For native development, use a custom Expo development build. Expo Go is not
supported by this app.

Build and install the development client on a connected iPhone or simulator:

```bash
bunx expo run:ios --device
```

After the development client is installed, start Metro for that client:

```bash
bun run start:dev-client
```

Then open the installed `Odysseus` app and scan or paste a pairing payload from
a reachable Odysseus server. Local HTTP pairings require the phone to be on the
same network or VPN as the server host; off-network use requires a trusted
reachable HTTPS origin.

## Developer Commands

| Task | Command |
| --- | --- |
| Start Metro for the custom development client | `bun run start:dev-client` |
| Rebuild the iOS development client | `bun run ios` |
| Rebuild the Android development client | `bun run android` |
| Start the web target | `bun run web` |
| Run unit tests, TypeScript, and lint | `bun run check` |
| Verify iOS and Apple platforms | `bun run verify:ios` |
| Verify web | `bun run verify:web` |
| Pull App Store metadata | `bun run store:metadata:pull` |
| Push App Store metadata | `APP_REVIEW_PHONE=... bun run store:metadata:push` |
| Regenerate App Store screenshots | `bun run store:screenshots` |
| Regenerate production image assets | `bun run assets:production` |

## Running

Start Metro for an installed development client:

```bash
bun run start:dev-client
```

Rebuild the native development client when native modules or native config
change:

```bash
bun run ios
bun run android
```

Run web:

```bash
bun run web
```

## Verification

This app requires a custom Expo development build and will not work in Expo Go.
Use the project verification commands:

```bash
bun run verify:ios
bun run verify:web
```

`bun run verify:ios` wraps `npx serve-sim` for iOS and Apple platform checks.
`bun run verify:web` wraps `npx agent-browser` for web verification.

## Pairing

The app expects a companion pairing payload generated by the Odysseus server.
Remote pairings can provide a trusted HTTP or HTTPS origin directly:

```json
{
  "v": 1,
  "base_url": "https://odysseus-mac.taildc85bf.ts.net",
  "token": "ody_..."
}
```

Same-network development pairings can provide host and port:

```json
{
  "v": 1,
  "host": "192.168.1.10",
  "port": 7000,
  "token": "ody_..."
}
```

Pairing can be completed by scanning the QR code or pasting the JSON payload
into the pairing screen. When `base_url` is present, the app prefers that
origin first and falls back to `host` + `port` only when the remote origin is
unreachable. HTTP is intended for trusted same-network development devices.
Use HTTPS only with trusted Odysseus origins.

For Tailscale pairings, the host Mac should run the full `Tailscale.app`
network extension. A rootless/userspace `tailscaled` setup can leave the
`https://<machine>.ts.net` origin working only through Tailscale's local proxy
on the Mac, which means normal Safari or `curl` checks on the host may fail and
mobile debugging gets misleading fast.

After pairing, the app stores the payload in `expo-secure-store` on native
platforms. Web falls back to in-memory storage for the current runtime.

## Odysseus API Contract

The companion client calls these server endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/companion/manifest` | Reads contract version, auth requirements, features, transport guidance, and command metadata |
| `GET /api/companion/models` | Lists owner-visible model endpoints |
| `GET /api/companion/sessions` | Lists existing companion sessions |
| `POST /api/companion/sessions` | Creates a session with endpoint, model, and RAG options |
| `POST /api/chat_stream` | Streams chat responses over SSE |
| `POST /api/chat/stop/:sessionId` | Stops an active stream |
| `GET /api/chat/resume/:sessionId` | Resumes a detached stream |
| `GET /api/chat/stream_status/:sessionId` | Reads stream status |
| `POST /api/companion/keys` | Registers the device command public key |
| `DELETE /api/companion/keys/:keyId` | Revokes the registered command key |
| `POST /api/companion/commands` | Runs a signed command request |

When the paired server advertises `features.remote_development.allowed_workspace_roots`,
the Commands screen uses that dynamic list as the workspace picker for
`list_files`, `read_file`, `edit_file`, and `run_check` instead of relying on a
hard-coded absolute path in the mobile client.

When the paired server advertises `features.remote_development.agent_bash_enabled`,
the chat and goal screens expose the Terminal toggle for agent-mode bash work.
That path still requires the paired token to carry `remote_development`.

Command requests include `X-Odysseus-Command-*` headers generated from the
device key. The private signing seed stays on the device.

## Project Structure

| Path | Purpose |
| --- | --- |
| `src/app` | Expo Router routes, API route, modals, and platform layouts |
| `src/api/odysseusClient.ts` | Pairing parsing, REST calls, SSE parsing, and command requests |
| `src/state/companion-store.tsx` | Pairing, manifest, session, command key, and command state |
| `src/crypto/companionSigning.ts` | Command key generation and request signing |
| `src/storage/secureCompanionStorage.ts` | Native SecureStore plus web fallback storage |
| `src/screens` | Pairing, session, commands, and settings screens |
| `src/components/chat` | Streaming conversation UI and prompt input |
| `src/global.css` | Tailwind v4, Uniwind theme tokens, and SF semantic color aliases |
| `store.config.js` | Canonical App Store metadata plus the required `APP_REVIEW_PHONE` injection |
| `AGENTS.md` / `CLAUDE.md` | Shared repo instructions for Codex and Claude-compatible agent tooling |

## App Store Metadata

Manage Apple App Store metadata and screenshots with EAS metadata commands:

```bash
bun run store:metadata:pull
APP_REVIEW_PHONE=... bun run store:metadata:push
```

`store.config.js` is the single metadata source of truth. Set
`APP_REVIEW_PHONE` before pushing metadata or submitting a production build so
the review contact block stays complete.
