export interface CustomCommand {
  id: string;
  name: string;
  command: string;
  description?: string;
  workdir?: string;
  terminal: boolean;
  icon?: string;
  group?: string;
  createdAt: string;
}

export type CreateCommandInput = Pick<CustomCommand, "name" | "command"> &
  Partial<Pick<CustomCommand, "description" | "workdir" | "terminal" | "icon" | "group">>;

export type UpdateCommandInput = Partial<Pick<CustomCommand, "name" | "command" | "description" | "workdir" | "terminal" | "icon" | "group">>;
