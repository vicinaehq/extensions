import { useState, useEffect } from "react";
import { execAsync } from "../utils/execAsync";

export const useIsHyprlandInstalled = () => {
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const hasHyprland = await execAsync("which hyprctl").catch(() => false);
      setIsInstalled(!!hasHyprland);
    })();
  }, []);

  return isInstalled;
};
