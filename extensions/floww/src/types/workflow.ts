export interface Workflow {
  name: string;
  description?: string;
  filePath: string;
  fileExtension: string;
  lastModified?: Date;
}

export interface WorkflowConfig {
  description?: string;
  final_workspace?: number;
  workspaces?: Workspace[];
  totalAppCount?: number;
}

export interface Workspace {
  target: number;
  apps: App[];
}

export interface App {
  name: string;
  exec: string;
  args?: string[];
  wait?: number;
  type?: string;
}

export interface FlowwConfig {
  general?: {
    show_notifications?: boolean;
  };
  timing?: {
    workspace_switch_wait?: number;
    app_launch_wait?: number;
  };
}

export interface FlowwError {
  message: string;
  code: "CLI_NOT_FOUND" | "CONFIG_MISSING" | "NO_WORKFLOWS" | "PARSE_ERROR" | "EXECUTION_ERROR";
}
