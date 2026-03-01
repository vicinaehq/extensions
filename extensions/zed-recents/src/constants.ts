export const ZED_DB_PATHS = {
    linux: (home: string) => `${home}/.local/share/zed/db/0-stable/db.sqlite`,
    darwin: (home: string) => `${home}/Library/Application Support/Zed/db/0-stable/db.sqlite`,
    win32: (home: string) => `${home}/AppData/Local/Zed/db/0-stable/db.sqlite`,
} as const;

export const ZED_EXECUTABLE = "zed";
