import { closeMainWindow, open } from "@vicinae/api";
import { useEffect } from "react";

export default function OpenChat() {
  useEffect(() => {
    open("https://gemini.google.com/");
    closeMainWindow();
  }, []);

  return null;
}
