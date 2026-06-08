import type { OdysseusBackgroundSessionNativeModule } from "./OdysseusBackgroundSession.types";

const OdysseusBackgroundSessionModule: OdysseusBackgroundSessionNativeModule = {
  beginAsync: async () => null,
  endAsync: async () => undefined,
  endAllAsync: async () => undefined,
  getRemainingTimeAsync: async () => -1,
  getActiveTaskCountAsync: async () => 0,
};

export default OdysseusBackgroundSessionModule;
