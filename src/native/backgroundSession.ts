import OdysseusBackgroundSessionModule from "../../modules/odysseus-background-session/src/OdysseusBackgroundSessionModule";

export type BackgroundSessionId = string;

export async function beginBackgroundSession(reason: string) {
  try {
    return await OdysseusBackgroundSessionModule.beginAsync(reason);
  } catch {
    return null;
  }
}

export async function endBackgroundSession(identifier?: string | null) {
  if (!identifier) return;
  try {
    await OdysseusBackgroundSessionModule.endAsync(identifier);
  } catch {
    // Background completion is best effort and must never break chat cleanup.
  }
}

export async function getBackgroundTimeRemaining() {
  try {
    return await OdysseusBackgroundSessionModule.getRemainingTimeAsync();
  } catch {
    return -1;
  }
}
