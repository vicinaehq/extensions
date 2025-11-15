export interface Task {
  id: number;
  description: string;
  status: string;
  due?: string;
  priority?: string;
  project?: string;
  tags?: string[];
  urgency: number;
  entry: string;
  modified: string;
  uuid: string;
  start?: string;
  end?: string;
  wait?: string;
  recur?: string;
  mask?: string;
  imask?: number;
  parent?: string;
  depends?: string;
  scheduled?: string;
  until?: string;
  annotations?: Array<{ entry: string; description: string }>;
}

export interface Preferences {
  "default-view": string;
}
