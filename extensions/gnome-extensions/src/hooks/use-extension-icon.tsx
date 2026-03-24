import { useEffect, useRef, useState } from "react";
import { executeCommand } from "../utils/execute-command";
import { UseExtensionIconResult } from "../interfaces/use-extension-icon-result";

async function getExtensionIcon(uuid: string): Promise<string | undefined> {
  try {
    const result = await executeCommand(
      `curl -s "https://extensions.gnome.org/extension-info/?uuid=${encodeURIComponent(uuid)}"`,
    );
    if (result.stdout) {
      const data = JSON.parse(result.stdout);
      if (data.icon) {
        return `https://extensions.gnome.org${data.icon}`;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function useExtensionIcon(uuid: string): UseExtensionIconResult {
  const [iconPath, setIconPath] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    getExtensionIcon(uuid).then(async url => {
      if (url) {
        const tmp = `/tmp/vicinae-gnome-ext-icon-${uuid.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
        const { error } = await executeCommand(`curl -s "${url}" -o "${tmp}"`);
        if (!error) {
          setIconPath(tmp);
        }
      }
      setIsLoading(false);
    });
  }, [uuid]);

  return { iconPath, isLoading };
}
