export enum ProjectEnvironment {
    Local = "",
    RemoteWSL = "wsl",
    Codespace = "vsonline",
    RemoteTunnel = "tunnel",
    RemoteSSH = "ssh-remote",
    DevContainer = "dev-container",
}

export enum ProjectType {
    File = "file",
    Folder = "folder",
    Workspace = "workspace",
}

export interface RecentProject {
    path: string;
    label: string;
    type: ProjectType;
    machineName?: string;
    lastOpened: number | undefined;
    environment: ProjectEnvironment;
}

export interface VSCodeDatabaseEntry {
    fileUri?: string;
    folderUri?: string;
    remoteAuthority?: string;
    workspace?: {
        configPath: string;
    };
    label?: string;
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

export enum WindowPreference {
    NewWindow = "NewWindow",
    ReuseWindow = "ReuseWindow",
    Default = "Default",
}

export interface Preferences {
    vscodeFlavour: VSCodeFlavour;
    windowPreference: WindowPreference;
}

export interface DatabaseRow {
    key: string;
    value: string;
}
