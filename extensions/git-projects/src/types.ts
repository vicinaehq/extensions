export interface Project {
  title: string;
  path: string;
}

export enum TerminalProgram {
  GnomeTerminal = 'gnome-terminal',
  Ptyxis = 'ptyxis',
  Ghostty = 'ghostty',
}

export enum EditorProgram {
  VSCode = 'code',
  Zed = 'zed',
}
