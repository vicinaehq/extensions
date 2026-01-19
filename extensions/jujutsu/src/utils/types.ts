export interface RevisionNode {
  change: import("./cli").JJChange;
  level: number;
  has_children: boolean;
  has_parents: boolean;
  position: 'root' | 'middle' | 'end' | 'single';
}
