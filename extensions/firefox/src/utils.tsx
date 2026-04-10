import { existsSync, readdirSync, readFile } from "fs";
import { homedir } from "os";
import path from "path";
import { promisify } from "util";

import { Action, ActionPanel, getPreferenceValues, LocalStorage, showToast, Toast } from "@vicinae/api";
import ini from "ini";
import initSqlJs, { Database } from "sql.js";

export const read = promisify(readFile);

const FIREFOX_PROFILE_STORAGE_KEY = "firefox.selectedProfile";

type FirefoxPreferences = {
  profile_dir: string;
};

const preferences = getPreferenceValues<FirefoxPreferences>();

export const FIREFOX_FOLDER = path.join(homedir(), preferences.profile_dir);

export type Profile = { name: string; path: string };

export async function getFirefoxProfiles(): Promise<{
  profiles: Profile[];
  defaultProfile: string;
}> {
  if (!existsSync(`${FIREFOX_FOLDER}/profiles.ini`)) {
    return { profiles: [], defaultProfile: "" };
  }
  const file = await read(`${FIREFOX_FOLDER}/profiles.ini`, "utf-8");
  const iniFile = ini.parse(file);
  const profiles = Object.keys(iniFile)
    .filter((key) => {
      if (key.startsWith("Profile")) {
        const pathStr = iniFile[key].Path;
        const profileDirPath = `${FIREFOX_FOLDER}/${pathStr}`;
        if (!existsSync(profileDirPath)) return false;
        const profileDirectory = readdirSync(profileDirPath);
        return profileDirectory.includes("places.sqlite");
      }
      return false;
    })
    .map((key) => ({ name: iniFile[key].Name, path: iniFile[key].Path }));
  let defaultProfile = "";

  const installKey = Object.keys(iniFile).find((key) =>
    key.startsWith("Install")
  );

  if (installKey && iniFile[installKey]?.Default) {
    defaultProfile = iniFile[installKey].Default;
  } else if (profiles.length > 0) {
    defaultProfile = profiles[0].path;
  }
  profiles.sort((a, b) => a.name?.localeCompare(b.name));
  return { profiles, defaultProfile };
}

export async function getStoredFirefoxProfile() {
  return LocalStorage.getItem<string>(FIREFOX_PROFILE_STORAGE_KEY);
}

export async function setStoredFirefoxProfile(profilePath: string) {
  await LocalStorage.setItem(FIREFOX_PROFILE_STORAGE_KEY, profilePath);
}

export async function initDatabase(profilePath: string): Promise<Database> {
  const dbPath = `${FIREFOX_FOLDER}/${profilePath}/places.sqlite`;

  if (!existsSync(dbPath)) {
    throw new Error(`places.sqlite not found for profile: ${profilePath}`);
  }

  const bufferRaw = await read(dbPath);
  const SQL = await initSqlJs({
    locateFile: () => path.resolve(__dirname, "assets/sql-wasm.wasm"),
  });

  return new SQL.Database(new Uint8Array(bufferRaw));
}

export function createCommonActions(url: string) {
  return (
    <ActionPanel>
      <Action.OpenInBrowser title="Open in Browser" url={url} />
      <Action.CopyToClipboard title="Copy Link" content={url} />
    </ActionPanel>
  );
}

export async function showErrorToast(title: string, message: string) {
  await showToast({
    style: Toast.Style.Failure,
    title,
    message,
  });
}
