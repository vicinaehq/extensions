import { JJChange } from "./cli";

export interface RevisionNode {
  change: JJChange;
  level: number;
  has_children: boolean;
  has_parents: boolean;
  position: 'root' | 'middle' | 'end' | 'single';
}

export function buildRevisionTree(changes: JJChange[]): RevisionNode[] {
  if (changes.length === 0) return [];

  return changes.map((change, index) => {
    const hasParents = change.parents && change.parents.length > 0;
    const hasChildren = index > 0 && changes[index - 1].parents?.includes(change.change_id);
    
    let position: RevisionNode['position'] = 'single';
    if (changes.length === 1) {
      position = 'single';
    } else if (index === 0) {
      position = hasParents ? 'root' : 'end';
    } else if (index === changes.length - 1) {
      position = 'end';
    } else {
      position = hasParents ? 'middle' : 'end';
    }

    return {
      change,
      level: index,
      has_children: !!hasChildren,
      has_parents: !!hasParents,
      position
    };
  });
}

export function getAncestryIndicator(node: RevisionNode, totalNodes: number): string {
  const indent = '  '.repeat(node.level);
  
  if (node.position === 'root' && node.has_children) {
    return `${indent}●──`;
  } else if (node.position === 'middle') {
    if (node.has_children) {
      return `${indent}●──`;
    }
    return `${indent}│   ${indent}○──`;
  } else if (node.position === 'end') {
    if (node.has_parents) {
      return `${indent}│   ${indent}○──`;
    }
    return `${indent}○──`;
  } else if (node.position === 'single') {
    return `${indent}●──`;
  }
  return `${indent}  `;
}
