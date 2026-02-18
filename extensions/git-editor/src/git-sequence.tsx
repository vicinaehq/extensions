import { Action, ActionPanel, KeyEquivalent, List } from "@vicinae/api";
import { GitEditorSetup } from "./GitEditorSetup";
import { useGitEditorConfigured } from "./hooks/useGitEditorConfig";
import { CommitType, useRebase } from "./hooks/useRebase";
import { getCommitTypeTitle } from "./utils/getCommitTypeTitle";
import { useState } from "react";

export default function GitSequence(props: GitCommitProps) {
  const gitFile = props?.arguments?.gitFile;
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const { commits, startRebase, moveCommitUp, moveCommitDown, updateCommit } =
    useRebase(gitFile);

  const isConfigured = useGitEditorConfigured();

  if (!gitFile || !isConfigured)
    return <GitEditorSetup gitFile={gitFile} isConfigured={isConfigured} />;
  return (
    <List isShowingDetail={isShowingDetail}>
      {commits.map((commit, index) => (
        <List.Item
          icon={{
            source: index === 0 ? "head.png" : "commit.png",
          }}
          key={commit.hash + index}
          title={commit.message}
          subtitle={commit.hash}
          accessories={[
            { text: commit.naturalDate },
            getCommitTypeTitle(commit.type),
          ]}
          detail={
            <List.Item.Detail
              markdown={commit.message}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label
                    title="Author"
                    text={commit.author}
                  />
                  <List.Item.Detail.Metadata.Label
                    title="Hash"
                    text={commit.fullHash}
                  />
                  <List.Item.Detail.Metadata.Label
                    title="Commit date"
                    text={`${commit.naturalDate} (${commit.date})`}
                  />
                  <List.Item.Detail.Metadata.Label
                    title="Changes"
                    text={`+${commit.fileStats.added} ~${commit.fileStats.modified} -${commit.fileStats.removed}`}
                  />
                  <List.Item.Detail.Metadata.Separator />
                  <List.Item.Detail.Metadata.TagList title="Tags">
                    {commit.tags.map((tag) => (
                      <List.Item.Detail.Metadata.TagList.Item
                        key={tag}
                        text={tag}
                        color={"#eed535"}
                      />
                    ))}
                  </List.Item.Detail.Metadata.TagList>
                  <List.Item.Detail.Metadata.TagList title="Branches">
                    {commit.branches.map((branch) => (
                      <List.Item.Detail.Metadata.TagList.Item
                        key={branch}
                        text={branch}
                        color={"#4caf50"}
                      />
                    ))}
                  </List.Item.Detail.Metadata.TagList>
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Open details"
                onAction={() => setIsShowingDetail((prev) => !prev)}
              />
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
