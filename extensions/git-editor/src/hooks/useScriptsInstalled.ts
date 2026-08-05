import { useEffect, useState } from "react";
import {
  findScriptInPath,
  getUserBinPath,
  installScripts,
} from "../utils/scriptInstaller";
import { SCRIPT_NAMES } from "../utils/scripts";
import { Alert, confirmAlert } from "@vicinae/api";
import { execSync } from "child_process";

export type ScriptsStatus = {
  editorPath: string | null;
  sequenceEditorPath: string | null;
  allInstalled: boolean;
};

export const useSetup = () => {
  const [status, setStatus] = useState<ScriptsStatus>({
    editorPath: null,
    sequenceEditorPath: null,
    allInstalled: false,
  });

  const handleInstallBoth = async () => {
    const confirmed = await confirmAlert({
      title: "Install Git Editor Scripts",
      message:
        "This will install two executable scripts to your system:\n\n" +
        "• git-vicinae-editor\n" +
        "• git-vicinae-sequence-editor\n\n" +
        `These scripts will be placed in ${getUserBinPath()} and your git configuration will be updated to use them.`,
      primaryAction: {
        title: "Install Scripts",
        style: Alert.ActionStyle.Default,
      },
      dismissAction: {
        title: "Cancel",
      },
    });
    if (!confirmed) return;
    configureGit();
    installScripts();
    const editorPath = findScriptInPath(SCRIPT_NAMES.editor);
    const sequenceEditorPath = findScriptInPath(SCRIPT_NAMES.sequenceEditor);
    setStatus({
      editorPath,
      sequenceEditorPath,
      allInstalled: !!(editorPath && sequenceEditorPath),
    });
  };

  const handleConfigureGit = async () => {
    const confirmed = await confirmAlert({
      title: "Configure Git Editor Scripts",
      message:
        "This will configure git to use the installed editor scripts:\n\n" +
        "• git-vicinae-editor\n" +
        "• git-vicinae-sequence-editor\n\n" +
        "Make sure the scripts are already installed before proceeding.",
      primaryAction: {
        title: "Configure Git",
        style: Alert.ActionStyle.Default,
      },
      dismissAction: {
        title: "Cancel",
      },
    });
    if (!confirmed) return;
    configureGit();
  };

  const configureGit = () => {
    execSync('git config --global core.editor "git-vicinae-editor"');
    execSync(
      'git config --global sequence.editor "git-vicinae-sequence-editor"',
    );
  };

  const handleInstallScripts = async () => {
    const confirmed = await confirmAlert({
      title: "Install Git Editor Scripts",
      message:
        "This will install two executable scripts to your system:\n\n" +
        "• git-vicinae-editor\n" +
        "• git-vicinae-sequence-editor\n\n" +
        `These scripts will be placed in ${getUserBinPath()}`,
      primaryAction: {
        title: "Install Scripts",
        style: Alert.ActionStyle.Default,
      },
      dismissAction: {
        title: "Cancel",
      },
    });
    if (!confirmed) return;
    installScripts();
    const editorPath = findScriptInPath(SCRIPT_NAMES.editor);
    const sequenceEditorPath = findScriptInPath(SCRIPT_NAMES.sequenceEditor);
    setStatus({
      editorPath,
      sequenceEditorPath,
      allInstalled: !!(editorPath && sequenceEditorPath),
    });
  };
  useEffect(() => {
    const editorPath = findScriptInPath(SCRIPT_NAMES.editor);
    const sequenceEditorPath = findScriptInPath(SCRIPT_NAMES.sequenceEditor);
    setStatus({
      editorPath,
      sequenceEditorPath,
      allInstalled: !!(editorPath && sequenceEditorPath),
    });
  }, []);

  return {
    ...status,
    handleInstallScripts,
    handleInstallBoth,
    handleConfigureGit,
  };
};
