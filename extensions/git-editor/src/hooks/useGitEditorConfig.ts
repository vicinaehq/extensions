import { useMemo } from "react";
import { getGitConfig } from "../utils/getGitConfig";

export const useGitEditorConfigured = () => {
  const isConfigured = useMemo(() => {
    const editor = getGitConfig("core.editor");
    const sequenceEditor = getGitConfig("sequence.editor");

    return (
      (editor?.includes("git-vicinae-editor") ?? false) &&
      (sequenceEditor?.includes("git-vicinae-sequence-editor") ?? false)
    );
  }, []);

  return isConfigured;
};
