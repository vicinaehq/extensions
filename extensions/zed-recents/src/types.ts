export interface RecentProject {
    path: string;
    label: string;
    exists: boolean;
    isDirectory: boolean;
    lastOpened: Date | undefined;
    keywords: string[];
    remote?: RemoteConnection;
}

export interface RemoteConnection {
    kind: string;
    host?: string;
    port?: number;
    user?: string;
    name?: string;
}

export enum WindowPreference {
    NewWindow = "NewWindow",
    AddToWindow = "AddToWindow",
    Default = "Default",
}

export interface Preferences {
    windowPreference: WindowPreference;
}
