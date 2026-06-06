export interface GnomeExtension {
  uuid: string;
  name: string;
  description: string;
  enabled: boolean;
  version?: string;
  author?: string;
  path?: string;
  url?: string;
  state?: string;
  settingsSchema?: string;
  hasPrefs?: boolean;
}
