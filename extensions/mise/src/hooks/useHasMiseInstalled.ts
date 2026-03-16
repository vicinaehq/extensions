import { useState, useEffect } from "react";
import { execAsync } from "../utils/execAsync";

export const useHasMiseInstalled = () => {
  const [hasMiseInstalled, setHasMiseInstalled] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      const hasMise = await execAsync("which mise").catch(() => false);
      setHasMiseInstalled(!!hasMise);
    })();
  }, []);
  return hasMiseInstalled;
};
