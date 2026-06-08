import * as SecureStore from "expo-secure-store";

type StoredValue = string | null;

const volatileStore = new Map<string, string>();

async function canUseSecureStore() {
  if (process.env.EXPO_OS === "web") return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getSecureItem(key: string): Promise<StoredValue> {
  if (await canUseSecureStore()) {
    return SecureStore.getItemAsync(key);
  }
  return volatileStore.get(key) ?? null;
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return;
  }
  volatileStore.set(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  volatileStore.delete(key);
}
