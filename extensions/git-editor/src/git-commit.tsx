import { getPreferenceValues } from "@vicinae/api";
import { ConventionalCommit } from "./ConventionalCommit";
import { GitEditorSetup } from "./GitEditorSetup";
import { SimpleCommit } from "./SimpleCommit";
import { useCommitMessage } from "./hooks/useCommitMessage";
import { useGitEditorConfigured } from "./hooks/useGitEditorConfig";

export default function GitCommit(props: GitCommitProps) {
  const gitFile = props?.arguments?.gitFile;
  const { commitMessage } = useCommitMessage(gitFile);
  const isConfigured = useGitEditorConfigured();

  if (!gitFile || !isConfigured)
    return <GitEditorSetup gitFile={gitFile} isConfigured={isConfigured} />;

  if (commitType === "conventional" && !commitMessage) {
    return <ConventionalCommit gitFile={gitFile} />;
  }
  return <SimpleCommit gitFile={gitFile} />;
}

type GitCommitProps = {
  arguments: {
    gitFile?: string;
  };
};

const { commitType } = getPreferenceValues<{
  commitType: "simple" | "conventional";
}>();
