import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  useNavigation,
} from "@vicinae/api";
import { open, writeFile } from "fs/promises";
import { useEffect } from "react";
import { ConventionalCommit } from "./ConventionalCommit";
import { useCommitMessage } from "./hooks/useCommitMessage";

export const SimpleCommit = ({ gitFile }: SimpleCommitProps) => {
  const { commitMessage, setCommitMessage } = useCommitMessage(gitFile);
  useEffect(() => {
    return () => {
      open(gitFile).then((file) => {
        file.close();
      });
    };
  }, []);

  const { push } = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action
            title="Commit"
            onAction={async () => {
              writeFile(gitFile, commitMessage);
              closeMainWindow();
            }}
          />
          <Action
            title="Swap to conventional commit"
            onAction={() => {
              push(<ConventionalCommit gitFile={gitFile} />);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        title="Commit message"
        value={commitMessage}
        onChange={setCommitMessage}
        id="commit-message"
      />
    </Form>
  );
};

type SimpleCommitProps = {
  gitFile: string;
};
