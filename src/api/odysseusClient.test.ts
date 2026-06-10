import { describe, expect, mock, test } from "bun:test";

import {
  companionBaseUrlCandidatesFromPairing,
  OdysseusApiError,
  OdysseusClient,
  chatEventFromJson,
  isChatStreamInactiveError,
  isInvalidApiTokenError,
} from "./odysseusClient";
import { companionBaseUrlFromPairing, parsePairingPayload } from "./pairing";
import { type CommandKeyPair } from "@/crypto/companionSigning";

const token = "ody_test_token";

mock.module("@/crypto/companionSigning", () => ({
  signedCommandHeaders: async () => ({
    "X-Odysseus-Command-Key-Id": "mobile-test",
    "X-Odysseus-Command-Nonce": "test-nonce",
    "X-Odysseus-Command-Signature": "test-signature",
    "X-Odysseus-Command-Timestamp": "2026-06-09T00:00:00.000Z",
    "X-Odysseus-Command-Version": "1",
  }),
}));

describe("pairing payload parsing", () => {
  test("remote-only payload with base_url and token succeeds", () => {
    const payload = parsePairingPayload({
      v: 1,
      base_url: "https://odysseus-mac.taildc85bf.ts.net",
      token,
    });

    expect(payload).toEqual({
      v: 1,
      base_url: "https://odysseus-mac.taildc85bf.ts.net",
      token,
    });
    expect(companionBaseUrlFromPairing(payload)).toBe(
      "https://odysseus-mac.taildc85bf.ts.net",
    );
  });

  test("base_url is preferred over host and port", () => {
    const payload = parsePairingPayload({
      v: 1,
      base_url: "https://remote.example.com:8443",
      host: "192.168.1.50",
      port: 7860,
      token,
    });

    expect(payload).toEqual({
      v: 1,
      base_url: "https://remote.example.com:8443",
      host: "192.168.1.50",
      port: 7860,
      token,
    });
    expect(companionBaseUrlFromPairing(payload)).toBe(
      "https://remote.example.com:8443",
    );
    expect(companionBaseUrlCandidatesFromPairing(payload)).toEqual([
      "https://remote.example.com:8443",
      "http://192.168.1.50:7860",
    ]);
  });

  test("LAN payload with host, port, and token succeeds", () => {
    const payload = parsePairingPayload({
      v: 1,
      host: "192.168.1.50",
      port: 7860,
      token,
    });

    expect(payload).toEqual({
      v: 1,
      host: "192.168.1.50",
      port: 7860,
      token,
    });
    expect(companionBaseUrlFromPairing(payload)).toBe("http://192.168.1.50:7860");
  });

  test("payload without base_url or host fails with host error", () => {
    expect(() =>
      parsePairingPayload({
        v: 1,
        port: 7860,
        token,
      }),
    ).toThrow("Pairing host is required");
  });

  test("invalid base_url path, query, hash, and credentials fail", () => {
    for (const base_url of [
      "https://remote.example.com/path",
      "https://remote.example.com?x=1",
      "https://remote.example.com#pairing",
      "https://user:pass@remote.example.com",
    ]) {
      expect(() =>
        parsePairingPayload({
          v: 1,
          base_url,
          token,
        }),
      ).toThrow();
    }
  });
});

describe("OdysseusClient", () => {
  test("chat event parsing preserves thinking deltas", () => {
    expect(
      chatEventFromJson({
        delta: "checking the request",
        thinking: true,
      }),
    ).toEqual({
      type: "delta",
      text: "checking the request",
      thinking: true,
    });
  });

  test("chat event parsing exposes tool events", () => {
    expect(
      chatEventFromJson({
        type: "tool_start",
        tool: "read_file",
        command: "README.md",
      }),
    ).toEqual({
      type: "tool_start",
      data: {
        type: "tool_start",
        tool: "read_file",
        command: "README.md",
      },
    });
  });

  test("manifest uses the selected base URL and bearer token", async () => {
    const requests: { url: string; headers: Headers }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(input), headers });
      return new Response(
        JSON.stringify({
          name: "Odysseus",
          version: "1.0",
          contract_version: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const payload = parsePairingPayload({
        v: 1,
        base_url: "https://odysseus-mac.taildc85bf.ts.net",
        token,
      });
      const client = new OdysseusClient(
        companionBaseUrlFromPairing(payload),
        `\n ${token}\t`,
      );

      await client.manifest();

      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe(
        "https://odysseus-mac.taildc85bf.ts.net/api/companion/manifest",
      );
      expect(requests[0]?.headers.get("Authorization")).toBe(`Bearer ${token}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("signed commands use the trimmed pairing bearer token", async () => {
    const requests: { url: string; headers: Headers; body: string }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        headers,
        body: String(init?.body ?? ""),
      });
      return new Response(
        JSON.stringify({
          ok: true,
          verified: {},
          command: { name: "server_status" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const commandKey: CommandKeyPair = {
      keyId: "mobile-test",
      publicKeyB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      privateSeedB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      fingerprint: "test",
      registered: true,
    };

    try {
      const payload = parsePairingPayload({
        v: 1,
        base_url: "https://odysseus-mac.taildc85bf.ts.net",
        token,
      });
      const client = new OdysseusClient(
        companionBaseUrlFromPairing(payload),
        `\n ${payload.token}\t`,
      );

      await client.command("server_status", {}, commandKey);

      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe(
        "https://odysseus-mac.taildc85bf.ts.net/api/companion/commands",
      );
      expect(requests[0]?.headers.get("Authorization")).toBe(`Bearer ${token}`);
      expect(requests[0]?.headers.get("Content-Type")).toBe("application/json");
      expect(JSON.parse(requests[0]?.body ?? "{}")).toEqual({
        command: "server_status",
        args: {},
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("manifest honors a custom timeout override", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as typeof fetch);

    try {
      const payload = parsePairingPayload({
        v: 1,
        base_url: "https://odysseus-mac.taildc85bf.ts.net",
        token,
      });
      const client = new OdysseusClient(
        companionBaseUrlFromPairing(payload),
        token,
      );

      await expect(client.manifest({ timeoutMs: 1200 })).rejects.toThrow(
        "/api/companion/manifest timed out after 1s while connecting to https://odysseus-mac.taildc85bf.ts.net",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("server goal runs use the companion bearer token", async () => {
    const requests: { url: string; headers: Headers; body: string }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        headers,
        body: String(init?.body ?? ""),
      });
      return new Response(
        JSON.stringify({
          run: {
            id: "run-1",
            goal: "Ship it",
            session_id: "session-1",
            status: "queued",
            round: 0,
            started_at: "2026-06-09T00:00:00Z",
            updated_at: "2026-06-09T00:00:00Z",
            transcript: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const client = new OdysseusClient(
        "https://odysseus-mac.taildc85bf.ts.net",
        ` ${token}\n`,
      );

      const result = await client.startGoal({
        sessionId: "session-1",
        goal: "Ship it",
        useWeb: true,
        allowBash: false,
      });

      expect(result.run.id).toBe("run-1");
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe(
        "https://odysseus-mac.taildc85bf.ts.net/api/companion/goals",
      );
      expect(requests[0]?.headers.get("Authorization")).toBe(`Bearer ${token}`);
      expect(JSON.parse(requests[0]?.body ?? "{}")).toEqual({
        session_id: "session-1",
        goal: "Ship it",
        use_web: true,
        allow_bash: false,
        max_turns: 0,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("distinguishes inactive stream errors by status and path", () => {
    const resumeError = new OdysseusApiError("/api/chat/resume/abc", 404);
    const statusError = new OdysseusApiError("/api/chat/stream_status/abc", 404);
    const otherError = new OdysseusApiError("/api/chat/stream_status/abc", 500);

    expect(isChatStreamInactiveError(resumeError)).toBe(true);
    expect(isChatStreamInactiveError(statusError)).toBe(true);
    expect(isChatStreamInactiveError(otherError)).toBe(false);
    expect(isChatStreamInactiveError(new Error("Chat resume failed: 404"))).toBe(
      false,
    );
  });

  test("classifies invalid companion bearer tokens", () => {
    const commandError = new OdysseusApiError(
      "/api/companion/commands",
      401,
      '{"error":"Invalid API token"}',
    );
    const signatureError = new OdysseusApiError(
      "/api/companion/commands",
      401,
      '{"error":"Invalid command signature"}',
    );

    expect(isInvalidApiTokenError(commandError)).toBe(true);
    expect(isInvalidApiTokenError(signatureError)).toBe(false);
    expect(isInvalidApiTokenError(new Error("Invalid API token"))).toBe(false);
  });

  test("resume stream preserves structured 404 for stale detached run", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((async (_input: RequestInfo | URL) => {
      return new Response("not found", { status: 404 });
    }) as typeof fetch);

    try {
      const payload = parsePairingPayload({
        v: 1,
        base_url: "https://odysseus-mac.taildc85bf.ts.net",
        token,
      });
      const client = new OdysseusClient(companionBaseUrlFromPairing(payload), token);

      const events: unknown[] = [];
      const maybeError = await client
        .resumeStream("session-123", (event) => {
          events.push(event);
        })
        .then(() => undefined)
        .catch((error) => error);

      expect(maybeError).toBeInstanceOf(OdysseusApiError);
      expect(isChatStreamInactiveError(maybeError)).toBe(true);
      expect(`${maybeError.message}`).not.toContain("Chat resume failed: 404");
      expect(events).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
