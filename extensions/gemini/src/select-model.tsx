import { closeMainWindow, openExtensionPreferences } from "@vicinae/api";
import { useEffect } from "react";

export default function SelectModel() {
  useEffect(() => {
    openExtensionPreferences();
    closeMainWindow();
  }, []);

  return null;
}
