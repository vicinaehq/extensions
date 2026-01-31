import { useEffect, useState } from "react";
import { getGitConfig } from "../utils/getGitConfig";

export const useGitEditorConfigured = () => {
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const editor = getGitConfig("core.editor");
    const sequenceEditor = getGitConfig("sequence.editor");

    setIsConfigured(
      (editor?.includes("git-vicinae-editor") ?? false) &&
        (sequenceEditor?.includes("git-vicinae-sequence-editor") ?? false),
    );
  }, []);

  return isConfigured;
};
