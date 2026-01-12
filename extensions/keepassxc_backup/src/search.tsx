import { useState, useEffect } from "react";
import { JSX } from "react/jsx-runtime";
import { getPreferenceValues, Detail } from "@vicinae/api";
import { KeePassLoader } from "./utils/keepass-loader";
import { InactivityTimer } from "./utils/inactivity-timer";
import SearchDatabase from "./components/search-database";
import UnlockDatabase from "./components/unlock-database";

interface Preference {
  lockAfterInactivity: string;
}

const preferences: Preference = getPreferenceValues();
const lockAfterInactivity = Number(preferences.lockAfterInactivity);

export default function Command(): JSX.Element {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    KeePassLoader.loadCredentialsCache().then((credentials) => {
      if (credentials.databasePassword) {
        if (lockAfterInactivity > 0) {
          InactivityTimer.hasRecentActivity(lockAfterInactivity).then((hasRecentActivity) => {
            if (hasRecentActivity) {
              setIsUnlocked(true);
              KeePassLoader.setCredentials(credentials.databasePassword, credentials.keyFile);
              InactivityTimer.launchInactivityTimer();
            } else {
              KeePassLoader.deleteCredentialsCache();
            }
            setIsLoaded(true);
          });
        } else {
          KeePassLoader.setCredentials(credentials.databasePassword, credentials.keyFile);
          setIsUnlocked(true);
          setIsLoaded(true);
        }
      } else {
        if (lockAfterInactivity > 0) {
          InactivityTimer.launchInactivityTimer();
        }
        setIsLoaded(true);
      }
    }).catch((error) => {
      console.error(error);
      setIsLoaded(true);
    });
  }, []);

  const handleUnlock = (password: string, keyFile: string) => {
    KeePassLoader.setCredentials(password, keyFile);
    InactivityTimer.launchInactivityTimer();
    setIsUnlocked(true);
  };

  const handleLock = () => {
    KeePassLoader.deleteCredentialsCache();
    setIsUnlocked(false);
  };

  if (!isLoaded) {
    return <Detail markdown="Loading KeePassXC database..." />;
  } else if (!isUnlocked) {
    return <UnlockDatabase onUnlock={handleUnlock} />;
  } else {
    return <SearchDatabase onLock={handleLock} />;
  }
}