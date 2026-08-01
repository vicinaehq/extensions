import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface KCMModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  keywords: string[];
  execCommand: string;
  isKDE5: boolean;
}

async function loadKCMDescriptions(): Promise<Map<string, string>> {
  const descriptionsMap = new Map<string, string>();

  try {
    const { stdout } = await execAsync("kcmshell6 --list", { timeout: 5000 });
    const lines = stdout.split("\n");

    for (const line of lines) {
      if (line.startsWith("The following") || !line.trim()) continue;

      const match = line.match(/^(\S+)\s+-\s+(.+)$/);
      if (match && match[1] && match[2]) {
        descriptionsMap.set(match[1], match[2].trim());
      }
    }
  } catch (error) {
    console.error("Failed to load kcmshell6 descriptions:", error);
  }

  return descriptionsMap;
}

function parseDesktopFile(
  filePath: string,
  descriptionsMap: Map<string, string>
): KCMModule | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    let name = "";
    let description = "";
    let icon = "";
    let keywords: string[] = [];
    let moduleId = "";
    let execCommand = "";

    for (const line of lines) {
      if (line.startsWith("Name=") && !line.includes("[")) {
        name = line.substring(5).trim();
      } else if (line.startsWith("Comment=") && !line.includes("[")) {
        description = line.substring(8).trim();
      } else if (line.startsWith("Icon=")) {
        icon = line.substring(5).trim();
      } else if (line.startsWith("X-KDE-Keywords=") && !line.includes("[")) {
        const keywordStr = line.substring(15).trim();
        keywords = keywordStr
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k.length > 0);
      } else if (line.startsWith("X-KDE-Library=")) {
        moduleId = line.substring(14).trim();
      } else if (line.startsWith("Exec=")) {
        execCommand = line.substring(5).trim();
      }
    }

    if (!name) return null;

    let finalModuleId = "";
    let finalCommand = "";
    let isKDE5 = false;

    // systemsettings and kcmshell6 both take the module id as the first argument
    if (execCommand.includes("systemsettings") || execCommand.includes("kcmshell6")) {
      const parts = execCommand.split(/\s+/);
      if (parts.length > 1 && parts[1]) {
        finalModuleId = parts[1];
        finalCommand = execCommand;
      }
    } else if (moduleId) {
      finalModuleId = moduleId;
      finalCommand = `kcmshell6 ${moduleId}`;
      isKDE5 =
        moduleId.includes("systemsettings_qwidgets") ||
        moduleId.includes("kf5/");
    }

    if (!finalModuleId) return null;

    // skip mobile modules (designed for Plasma Mobile, not desktop systemsettings)
    if (finalModuleId.startsWith("kcm_mobile_")) {
      return null;
    }

    // skip modules that don't exist in kcmshell6 --list
    if (!descriptionsMap.has(finalModuleId)) {
      return null;
    }

    if (
      filePath.includes("/kservices5/") ||
      filePath.includes("/kservices6/")
    ) {
      isKDE5 = true;
    }

    const finalDescription =
      descriptionsMap.get(finalModuleId) || description || name;

    return {
      id: finalModuleId,
      name,
      description: finalDescription,
      icon: icon || "preferences-system",
      keywords,
      execCommand: finalCommand,
      isKDE5,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

/**
 * Scan a directory for .desktop files and collect parsed KCM modules that
 * haven't been seen yet (by id or display name).
 */
function scanDirectory(
  dir: string,
  descriptionsMap: Map<string, string>,
  modules: KCMModule[],
  seenIds: Set<string>,
  seenNames: Set<string>,
  fileFilter: (file: string) => boolean,
): void {
  if (!existsSync(dir)) return;

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!fileFilter(file)) continue;

      const module = parseDesktopFile(join(dir, file), descriptionsMap);
      if (!module) continue;

      const lowerName = module.name.toLowerCase();
      if (seenIds.has(module.id) || seenNames.has(lowerName)) continue;

      modules.push(module);
      seenIds.add(module.id);
      seenNames.add(lowerName);
    }
  } catch (error) {
    console.error(`Error reading ${dir} directory:`, error);
  }
}

export async function loadKCMModules(): Promise<KCMModule[]> {
  const descriptionsMap = await loadKCMDescriptions();
  const modules: KCMModule[] = [];
  // Deduplicate by both module id and display name. Different .desktop files
  // across the scanned directories can map to different IDs but the same
  // user-facing name (e.g. "Animations" from kcm_animations and
  // kcm_animations_x11), so tracking name prevents duplicate list entries.
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const isDesktop = (file: string) => file.endsWith(".desktop");
  const isKcmDesktop = (file: string) => file.startsWith("kcm_") && file.endsWith(".desktop");

  scanDirectory("/usr/share/applications", descriptionsMap, modules, seenIds, seenNames, isKcmDesktop);
  scanDirectory("/usr/share/kservices5", descriptionsMap, modules, seenIds, seenNames, isDesktop);
  scanDirectory("/usr/share/kservices6", descriptionsMap, modules, seenIds, seenNames, isDesktop);

  modules.sort((a, b) => a.name.localeCompare(b.name));

  return modules;
}
