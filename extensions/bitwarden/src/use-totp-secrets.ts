import { useEffect, useState } from 'react';
import { loadTotpSecrets } from './vault-cache';

export function useTotpSecrets(): Record<string, string> {
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  useEffect(() => {
    void loadTotpSecrets().then(setSecrets);
  }, []);
  return secrets;
}
