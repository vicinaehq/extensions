export const ZED_DB_DIRS = {
    linux: (home: string) => `${home}/.local/share/zed/db`,
    darwin: (home: string) => `${home}/Library/Application Support/Zed/db`,
    win32: (home: string) => `${home}/AppData/Local/Zed/db`,
} as const;

export const ZED_CHANNEL_DIRS = ["0-stable", "0-preview", "0-nightly", "0-dev"] as const;

export const ZED_EXECUTABLE = "zed";
