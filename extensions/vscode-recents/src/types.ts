export enum ProjectType {
    File = "file",
    Folder = "folder",
    Workspace = "workspace",
}

export interface RecentProject {
    path: string;
    label: string;
    type: ProjectType;
    lastOpened: number;
}

export interface VSCodeDatabaseEntry {
    fileUri?: string;
    folderUri?: string;
    workspace?: {
        configPath: string;
    };
    lastAccessTime?: number;
}

export interface VSCodeRecentData {
    entries: VSCodeDatabaseEntry[];
}

export enum VSCodeFlavour {
    Code = "Code",
    Cursor = "Cursor",
    VSCodium = "VSCodium",
    CodeInsiders = "Code - Insiders",
}

export interface Preferences {
    vscodeFlavour: VSCodeFlavour;
}

export interface DatabaseRow {
    key: string;
    value: string;
}
