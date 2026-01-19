import type { ReactElement } from "react";
import { List, Detail, Icon } from "@vicinae/api";

export function RepoPathValidationError(): ReactElement {
  return (
    <List>
      <List.Item
        title="Repository path required"
        subtitle="Provide a repository path as argument"
        icon={Icon.Warning}
      />
    </List>
  );
}

export function RepoPathValidationErrorDetail(): ReactElement {
  return (
    <Detail
      markdown="# Error\n\nRepository path required. Provide a repository path as argument."
    />
  );
}
