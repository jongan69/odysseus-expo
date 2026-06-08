export type BackgroundSessionId = string;

export type OdysseusBackgroundSessionNativeModule = {
  beginAsync(reason: string): Promise<BackgroundSessionId | null>;
  endAsync(identifier: BackgroundSessionId): Promise<void>;
  endAllAsync(): Promise<void>;
  getRemainingTimeAsync(): Promise<number>;
  getActiveTaskCountAsync(): Promise<number>;
};
