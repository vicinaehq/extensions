import { PackageManager } from "./utils/getPackageManager";

export type Package = {
  name: string;
  version: string;
  dev?: boolean;
  global: boolean;
};
