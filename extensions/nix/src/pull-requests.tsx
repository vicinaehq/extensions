import type { LaunchProps } from "@vicinae/api";
import { useNavigation, Icon } from "@vicinae/api";
import { searchNixpkgsPullRequests } from "./api";
import { PullRequestDetailView, PullRequestListItem } from "./components";
import GenericCommand from "./generic-command";

interface Arguments {
  pr?: string;
}

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const { pr } = props.arguments;
  const { push } = useNavigation();

  if (pr) {
    const n = Number(pr);
    if (!Number.isNaN(n)) {
      return <PullRequestDetailView prNumber={n} />;
    }
  }

  return (
    <GenericCommand
      searchFunction={searchNixpkgsPullRequests}
      errorMessage="Failed to search NixOS Packages Pull Requests. Please try again."
      placeholder="Search NixOS Packages Pull Requests..."
      emptyIcon={Icon.Gear}
      emptyTitle="Search NixOS Packages Pull Requests"
      emptyDescription="Type in the search bar to find NixOS Packages Pull Requests"
      isShowingDetail={false}
      renderItems={(options) =>
        options.map((option) => (
          <PullRequestListItem
            key={option.number}
            pr={option}
            onSelect={() => push(<PullRequestDetailView prNumber={option.number} />)}
          />
        ))
      }
    />
  );
}
