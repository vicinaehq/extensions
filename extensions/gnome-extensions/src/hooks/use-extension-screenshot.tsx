import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@vicinae/api";
import { executeCommand } from "../utils/execute-command";
import { ExtensionScreenshotProps } from "../interfaces/extension-screenshot-props";

async function getExtensionScreenshot(uuid: string): Promise<string | undefined> {
  try {
    const result = await executeCommand(
      `curl -s "https://extensions.gnome.org/extension-info/?uuid=${encodeURIComponent(uuid)}"`,
    );
    if (result.stdout) {
      const data = JSON.parse(result.stdout);
      if (data.screenshot) {
        return `https://extensions.gnome.org${data.screenshot}`;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export default function useExtensionScreenshot(uuid: string): ExtensionScreenshotProps {
  const [screenshot, setScreenshot] = useState<string | undefined>(undefined);
  const [localPath, setLocalPath] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    getExtensionScreenshot(uuid).then(async url => {
      setScreenshot(url);
      if (url) {
        const tmp = `/tmp/vicinae-gnome-ext-${uuid.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
        const { error } = await executeCommand(`curl -s "${url}" -o "${tmp}"`);
        if (!error) setLocalPath(tmp);
      }
      setIsLoading(false);
    });
  }, [uuid]);

  const openScreenshot = useCallback(async () => {
    if (!localPath) return;
    await open(localPath);
  }, [localPath]);

  return { screenshot, localPath, isLoading, openScreenshot };
}
