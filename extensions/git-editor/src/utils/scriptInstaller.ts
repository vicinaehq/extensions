import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  GIT_VICINAE_EDITOR_SCRIPT,
  GIT_VICINAE_SEQUENCE_EDITOR_SCRIPT,
  SCRIPT_NAMES,
} from "./scripts";

export const getUserBinPath = () => {
  const pathEnv = process.env.PATH || "";
  const home = homedir();

  const userPaths = pathEnv.split(":").filter((p) => {
    if (p.startsWith(home)) return true;
    if (p === `${home}/.local/bin`) return true;
    if (p === `${home}/bin`) return true;
    if (p === `${home}/.bin`) return true;
    return false;
  });

  const priorityPaths = [
    join(home, ".local", "bin"),
    join(home, "bin"),
    join(home, ".bin"),
  ];

  for (const p of priorityPaths) {
    if (userPaths.includes(p) && existsSync(p)) {
      return p;
    }
  }

  for (const p of userPaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  return join(home, ".local", "bin");
};

export const findScriptInPath = (scriptName: string): string | null => {
  try {
    const result = execSync(`which ${scriptName}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
};

export const installEditorScript = (
  scriptName: string,
  scriptContent: string,
): string => {
  const binPath = getUserBinPath();
  const scriptPath = join(binPath, scriptName);

  if (!existsSync(binPath)) {
    mkdirSync(binPath, { recursive: true });
  }

  writeFileSync(scriptPath, scriptContent, { encoding: "utf-8" });

  chmodSync(scriptPath, 0o755);

  return scriptPath;
};

export const installScripts = () => {
  if (!findScriptInPath(SCRIPT_NAMES.editor)) {
    installEditorScript(SCRIPT_NAMES.editor, GIT_VICINAE_EDITOR_SCRIPT);
  }
  if (!findScriptInPath(SCRIPT_NAMES.sequenceEditor)) {
    installEditorScript(
      SCRIPT_NAMES.sequenceEditor,
      GIT_VICINAE_SEQUENCE_EDITOR_SCRIPT,
    );
  }
};
