export interface Preferences {
  silverbulletApiUrl: string;
  silverbulletApiToken?: string;
}

export interface FileInfo {
  name: string;
  created: number;
  perm: string;
  contentType: string;
  lastModified: number;
  size: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  filePath: string;
  modified: number;
  contentLoaded: boolean;
}

export interface NoteDetailProps {
  note: Note;
  apiUrl: string;
  apiToken?: string;
}
