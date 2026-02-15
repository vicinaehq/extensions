export type NPMProject = {
  dependencies: Dependency[];
};

export type Dependency = {
  name: string;
  version: string;
  dev: boolean;
};
