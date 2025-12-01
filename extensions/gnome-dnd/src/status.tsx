import React, { useState, useEffect } from 'react';
import { Detail } from '@vicinae/api';
import { isDNDEnabled } from './utils/dnd';

export default function Command() {
  const [dndStatus, setDndStatus] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      const status = await isDNDEnabled();
      setDndStatus(status);
    })();
  }, []);

  return (
    <Detail
      markdown={
        dndStatus
          ? '## Do Not Disturb is **Enabled**'
          : '## Do Not Disturb is **Disabled**'
      }
    />
  );
}
