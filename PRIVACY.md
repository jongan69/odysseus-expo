# Odysseus Companion Privacy Policy

Effective date: June 9, 2026

Odysseus Companion is a client app for connecting to an Odysseus server that you
control or have permission to use. The app is designed for private companion
chat, session management, and signed command execution against that server.

## Data the app stores on your device

The app stores pairing information on your device so it can reconnect to your
Odysseus server. This can include:

- The server address and port from the pairing payload
- The companion access token issued by your Odysseus server
- Local chat session state needed to restore conversations
- A device command signing key used for authorized command requests

On native platforms, sensitive pairing data is stored with Expo SecureStore.
Chat session state is stored locally on the device.

## Data sent to your Odysseus server

When paired, the app sends requests directly to the Odysseus server configured
by your pairing payload. Depending on how you use the app, those requests can
include:

- Chat prompts and responses
- Session and model selection
- Attachment references or command inputs
- Signed command requests
- Device key registration or revocation requests

Your Odysseus server controls how this data is processed, retained, and routed
to any model providers or integrations.

## Data we collect

This app repository does not operate a hosted analytics, advertising, tracking,
or telemetry service for Odysseus Companion. The app does not sell personal
data. The app does not include third-party advertising SDKs.

If you connect the app to a third-party or hosted Odysseus server, that server's
operator may collect or process data according to their own policies.

## Network access

The app can access local network addresses when you pair with a same-network
Odysseus server. It can also connect to HTTPS Odysseus origins that you choose
to trust.

## Camera access

The app requests camera access only to scan an Odysseus companion pairing QR
code. Camera frames are used for QR scanning on the device and are not uploaded
by this app.

## Your choices

You can remove the app from your device to delete app-local data managed by the
operating system. You can also revoke a device command key from your paired
Odysseus server when the server exposes that capability.

## Contact

For support, use the project support page:
https://github.com/jongan69/odysseus-expo/blob/main/SUPPORT.md
