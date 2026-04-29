export interface Preferences {
  clientId: string;
  clientSecret: string;
  cliPath: string;
  serverUrl: string;
  serverCertsPath: string;
  syncOnLaunch: boolean;
  fetchFavicons: boolean;
  repromptIgnoreDuration: "0" | "30000" | "60000" | "300000" | "900000" | "never";
  windowActionOnCopy: "close" | "keepOpen";
  shouldCacheVaultItems: boolean;
}
