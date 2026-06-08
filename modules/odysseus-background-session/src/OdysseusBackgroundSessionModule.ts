import { requireNativeModule } from "expo";
import { Platform } from "react-native";

import type { OdysseusBackgroundSessionNativeModule } from "./OdysseusBackgroundSession.types";

const fallbackModule: OdysseusBackgroundSessionNativeModule = {
  beginAsync: async () => null,
  endAsync: async () => undefined,
  endAllAsync: async () => undefined,
  getRemainingTimeAsync: async () => -1,
  getActiveTaskCountAsync: async () => 0,
};

function loadNativeModule(): OdysseusBackgroundSessionNativeModule {
  if (Platform.OS !== "ios") return fallbackModule;
  try {
    return requireNativeModule<OdysseusBackgroundSessionNativeModule>(
      "OdysseusBackgroundSession",
    );
  } catch {
    return fallbackModule;
  }
}

export default loadNativeModule();
