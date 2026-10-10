import manifest from "../../package.json";

/** Extension version from package.json, the single source of truth. */
export const EXTENSION_VERSION: string =
  typeof (manifest as { version?: unknown }).version === "string"
    ? (manifest as { version: string }).version
    : "-";
