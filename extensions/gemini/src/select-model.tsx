import { closeMainWindow, openCommandPreferences } from "@vicinae/api";
import { useEffect } from "react";

export default function SelectModel() {
  useEffect(() => {
    openCommandPreferences();
    closeMainWindow();
  }, []);

  return null;
}
