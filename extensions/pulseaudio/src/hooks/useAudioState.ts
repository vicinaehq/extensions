import { useCallback, useEffect, useState } from "react";
import { pactl, type AudioState, type PactlClient } from "../pactl";
import { showErrorToast } from "../ui/toasts";

export function useAudioState(client: PactlClient = pactl): {
  audio: AudioState | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [audio, setAudio] = useState<AudioState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const state = await client.fetchAudioState();
      setAudio(state);
    } catch (e) {
      await showErrorToast({ title: "Failed to read PulseAudio state", error: e });
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { audio, isLoading, refresh };
}


