import {
  Application,
  getApplications,
  getDefaultApplication,
  Icon,
  showToast,
  Toast,
} from "@vicinae/api";
import { request } from "undici";
import { EXTENSION_ICON_MAP, genericFileIcon } from "./icons";
import { dsearch_port } from "./preferences";
import { getErrorMessage } from "./error_handling";

export const USER = process.env.USER ?? "";
export const HOME_DIRECTORY = USER ? `/home/${USER}/` : "/home/";

const SEARCH_ENDPOINT = `http://localhost:${dsearch_port}/search`;
const SEARCH_RESULT_LIMIT = "12";
const DEFAULT_QUERY = "";

export type PrettyHit = {
  fileName: string;
  filePath: string;
  curatedPath: string;
  defaultApp: Application | null;
  applications: Application[] | null;
};

export type Hit = {
  id: string;
  index: string;
  score: number;
};

export type Data = {
  hits: Hit[];
};

/** Normalizes a folder input into an absolute path under the current home directory. */
export function cleanFolderSpecifier(folderSpecifier?: string | null): string {
  const trimmedFolderSpecifier = folderSpecifier?.trim() ?? "";
  if (!trimmedFolderSpecifier) {
    return HOME_DIRECTORY;
  }

  if (trimmedFolderSpecifier.startsWith("/")) {
    return trimmedFolderSpecifier;
  }

  return `${HOME_DIRECTORY}${trimmedFolderSpecifier}/`;
}

/** Returns the parent directory portion of a file path. */
export function getDirectoryPath(filePath: string): string {
  return filePath.split("/").slice(0, -1).join("/");
}

/** Splits a path into non-empty path segments. */
export function splitPath(filePath: string): string[] {
  const parts = filePath.split("/");
  return parts.filter((part) => part.trim() !== "");
}

/** Shortens absolute user-home paths to a display-friendly `~/...` format. */
export function getCuratedPath(pathList: string[]): string {
  const curatedPath = pathList.slice(0, -1).join("/");
  return curatedPath.replace(`home/${USER}/`, "~/");
}

/** Extracts a normalized extension key and handles special multi-part filenames. */
function getExtensionKey(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (!lower) return null;
  if (lower === "dockerfile") return "dockerfile";
  if (lower.endsWith(".d.ts")) return "d.ts";

  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === lower.length - 1) return null;
  return lower.slice(dotIndex + 1);
}

/** Resolves the best icon for a hit using extension, default app, then generic fallback. */
export function getHitIcon(hit: PrettyHit): Icon | string {
  const extensionIcon = EXTENSION_ICON_MAP[getExtensionKey(hit.fileName) ?? ""];
  return extensionIcon ?? hit.defaultApp?.icon ?? genericFileIcon;
}

/** Enriches raw hits with display metadata and available application associations. */
export async function prettifyData(hits: Hit[]): Promise<PrettyHit[]> {
  return Promise.all(
    hits.map(async (hit) => {
      const pathList = splitPath(hit.id);
      const fileName = pathList[pathList.length - 1] ?? hit.id;

      let defaultApp: Application | null = null;
      let applications: Application[] | null = null;

      try {
        defaultApp = await getDefaultApplication(hit.id);
        applications = await getApplications(hit.id);
      } catch {
        defaultApp = null;
      }

      return {
        fileName,
        filePath: hit.id,
        curatedPath: getCuratedPath(pathList),
        defaultApp,
        applications,
      };
    }),
  );
}

/** Requests search hits from the DMS backend with current filters and folder scope. */
export async function fetchData(
  query: string,
  searchMode: string,
  folder: string = HOME_DIRECTORY,
): Promise<Hit[]> {
  const normalizedQuery = query.trim() || DEFAULT_QUERY;
  const fetchParams = new URLSearchParams({
    q: normalizedQuery,
    limit: SEARCH_RESULT_LIMIT,
    fuzzy: "true",
    type: searchMode,
    folder,
  });
  console.log(
    `Fetching data with query: ${normalizedQuery}, mode: ${searchMode}, folder: ${folder}`,
  );

  try {
    const { statusCode, body } = await request(
      `${SEARCH_ENDPOINT}?${fetchParams.toString()}`,
    );
    const data: Data = (await body.json()) as Data;
    return data.hits;
  } catch (error: unknown) {
    console.error("Error fetching data:", error);
    showToast(
      Toast.Style.Failure,
      `Failed to fetch data: ${getErrorMessage(error)}`,
    );
  }
  return [];
}
