import { getPreferenceValues } from "@vicinae/api";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { useState } from "react";

interface BedrockPreferences {
  bedrockApiKey: string;
  bedrockRegion: string;
}

export function useBedrock(): BedrockRuntimeClient {
  const [client] = useState(() => {
    const preferences = getPreferenceValues<BedrockPreferences>();
    return new BedrockRuntimeClient({
      region: preferences.bedrockRegion || "us-east-1",
      token: { token: preferences.bedrockApiKey },
      authSchemePreference: ["httpBearerAuth"],
    });
  });
  return client;
}
