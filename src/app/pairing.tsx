import { PairingScreen } from "@/screens/PairingScreen";
import { useRouter } from "expo-router";
import { useCallback } from "react";

export default function PairingRoute() {
  const router = useRouter();
  const handlePaired = useCallback(() => {
    router.replace("/");
  }, [router]);

  return (
    <PairingScreen
      title="Pair New Server"
      description="Scan or paste a new Odysseus companion payload. The current pairing stays active unless the new server connects successfully."
      onPaired={handlePaired}
    />
  );
}
