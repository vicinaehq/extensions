import type { ReactNode } from 'react';
import { List, Icon } from '@vicinae/api';

interface NiriListProps {
  children: ReactNode;
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon?: Icon;
}

export function NiriList({
  children,
  loading,
  emptyTitle,
  emptyDescription,
  emptyIcon = Icon.Window,
}: NiriListProps) {
  return (
    <List isLoading={loading}>
      {(!Array.isArray(children) || children.length === 0) && !loading ? (
        <List.EmptyView icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      ) : (
        children
      )}
    </List>
  );
}
