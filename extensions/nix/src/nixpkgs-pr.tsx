import { LaunchProps, useNavigation, List, Icon, getPreferenceValues, Detail } from "@vicinae/api";
import { searchNixpkgsPRs, getNixpkgsPR } from "./api";
import { useState } from "react";
import { FullPullRequest } from "./types";
import { PullRequestDetail, PullRequestListItem } from "./components";
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
      return <PRDetailView prNumber={n} />;
    }
  }

  return (
    <GenericCommand
      searchFunction={searchNixpkgsPRs}
      errorMessage="Failed to search nixpgs PRs. Please try again."
      placeholder="Search Nixpkgs PRs..."
      emptyIcon={Icon.Gear}
      emptyTitle="Search Nixpkgs PRs"
      emptyDescription="Type in the search bar to find Nixpkgs PRs"
      isShowingDetail={false}
      renderItems={(options) =>
        options.map((option) => <PullRequestListItem
          key={option.number}
          pr={option}
          onSelect={() => push(<PRDetailView prNumber={option.number} />)}
        />)
      }
    />
  );
}

function PRDetailView({ prNumber }: { prNumber: number }) {
  const [pr, setPr] = useState<FullPullRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const { githubToken } = getPreferenceValues<{ githubToken?: string }>();

  if (!githubToken) {
    return (
      <Detail
        markdown={`# Missing GitHub Token\n\nPlease set your GitHub token in the extension preferences to use the Nixpkgs PR search.`}
      />
    );
  }


  (async () => {
    try {
      const data = await getNixpkgsPR(prNumber);
      setPr(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  })();

  if (loading || !pr) return <List isLoading={true} />;
  return <PullRequestDetail pr={pr} />;
}
