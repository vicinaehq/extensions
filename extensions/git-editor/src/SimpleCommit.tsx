import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  useNavigation,
} from "@vicinae/api";
import { open, writeFile } from "fs/promises";
import { useEffect, useState } from "react";
import { ConventionalCommit } from "./ConventionalCommit";
import { useCommitMessage } from "./hooks/useCommitMessage";

export const SimpleCommit = ({ gitFile }: SimpleCommitProps) => {
  const { commitMessage, setCommitMessage } = useCommitMessage(gitFile);
  const [commitError, setCommitError] = useState<string | undefined>();
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
              if (!commitMessage) {
                setCommitError("Commit message is required");
                return;
              }
              await writeFile(gitFile, commitMessage);
              await closeMainWindow();
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
        error={commitError}
      />
    </Form>
  );
};

type SimpleCommitProps = {
  gitFile: string;
};
