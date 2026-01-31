import { Action, ActionPanel, KeyEquivalent, List } from "@vicinae/api";
import { GitEditorSetup } from "./GitEditorSetup";
import { useGitEditorConfigured } from "./hooks/useGitEditorConfig";
import { CommitType, useRebase } from "./hooks/useRebase";
import { getCommitTypeTitle } from "./utils/getCommitTypeTitle";

export default function GitSequence(props: GitCommitProps) {
  const gitFile = props?.arguments?.gitFile;
  const { commits, startRebase, moveCommitUp, moveCommitDown, updateCommit } =
    useRebase(gitFile);

  const isConfigured = useGitEditorConfigured();

  if (!gitFile || !isConfigured)
    return <GitEditorSetup gitFile={gitFile} isConfigured={isConfigured} />;
  return (
    <List>
      {commits.map((commit, index) => (
        <List.Item
          icon={{
            source: index === 0 ? "head.png" : "commit.png",
          }}
          key={commit.hash + index}
          title={commit.message}
          subtitle={commit.hash}
          accessories={[{ text: commit.date }, getCommitTypeTitle(commit.type)]}
          actions={
            <ActionPanel>
              <Action title="Start rebase" onAction={startRebase} />
              {rebaseOptions.map((option) => (
                <Action
                  key={option.type}
                  title={option.name}
                  shortcut={{
                    key: option.shortcut,
                    modifiers: ["ctrl"],
                  }}
                  onAction={() => updateCommit(commit, option.type)}
                />
              ))}
              <Action
                title="Move up"
                shortcut={{
                  key: "arrowUp",
                  modifiers: ["ctrl"],
                }}
                onAction={() => moveCommitUp(commit)}
              />
              <Action
                title="Move down"
                shortcut={{
                  key: "arrowDown",
                  modifiers: ["ctrl"],
                }}
                onAction={() => moveCommitDown(commit)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

type GitCommitProps = {
  arguments: {
    gitFile: string;
  };
};

const rebaseOptions: {
  name: string;
  type: CommitType;
  shortcut: KeyEquivalent;
}[] = [
  { name: "Pick", type: "pick", shortcut: "p" },
  { name: "Reword", type: "reword", shortcut: "r" },
  { name: "Edit", type: "edit", shortcut: "e" },
  { name: "Squash", type: "squash", shortcut: "s" },
  { name: "Fixup", type: "fixup", shortcut: "f" },
  { name: "Drop", type: "drop", shortcut: "d" },
];
