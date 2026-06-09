export type Package = {
  name: string;
  version: string;
  dev?: boolean;
  global: boolean;
  newVersion?: string;
};
