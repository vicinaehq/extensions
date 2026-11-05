import {
  Form,
  ActionPanel,
  Action,
  closeMainWindow,
  useNavigation,
} from "@vicinae/api";
import { useState, useEffect } from "react";
import { open, writeFile } from "fs/promises";
import { SimpleCommit } from "./SimpleCommit";

export const ConventionalCommit = ({ gitFile }: { gitFile: string }) => {
  const [commitMessage, setcommitMessage] = useState("");
  const [commitType, setcommitType] = useState("");
  const [commitScope, setCommitScope] = useState("");
  const [breakingChange, setbreakingChange] = useState(false);
  const [commitMessageError, setCommitMessageError] = useState<
    string | undefined
  >();
  const [commitTypeError, setCommitTypeError] = useState<string | undefined>();
  const { push } = useNavigation();

  useEffect(() => {
    return () => {
      open(gitFile).then((file) => {
        file.close();
      });
    };
  }, []);

  return (
    <Form
      actions={
        <ActionPanel>
          <Action
            title="Commit"
            onAction={async () => {
              if (!commitType) {
                setCommitTypeError("Commit type is required");
              }
              if (!commitMessage) {
                setCommitMessageError("Commit message is required");
              }
              if (!commitType || !commitMessage) return;
              const scope = commitScope ? `(${commitScope})` : "";
              const breaking = breakingChange ? "!" : "";
              const fullCommitMessage = `${commitType}${scope}${breaking}: ${commitMessage}`;
              await writeFile(gitFile, fullCommitMessage);
              await closeMainWindow();
            }}
          />
          <Action
            title="Swap to simple commit"
            onAction={() => {
              push(<SimpleCommit gitFile={gitFile} />);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="commit-type"
        title="Type"
        value={commitType}
        onChange={setcommitType}
        error={commitTypeError}
      >
        <Form.Dropdown.Item
          value="feat"
          title="feat: Introduces a new feature"
        />
        <Form.Dropdown.Item value="fix" title="fix: Patches a bug" />
        <Form.Dropdown.Item
          value="docs"
          title="docs: Documentation changes only"
        />
        <Form.Dropdown.Item
          value="ci"
          title="ci: Changes to CI configuration files and scripts"
        />
        <Form.Dropdown.Item value="wip" title="wip: Work in progress" />
      </Form.Dropdown>
      <Form.TextField
        id="commit-scope"
        title="Scope (optional)"
        value={commitScope}
        onChange={setCommitScope}
      />
      <Form.Checkbox
        id="breaking-change"
        title="Breaking Change"
        value={breakingChange}
        onChange={setbreakingChange}
      />
      <Form.TextArea
        title="Commit message"
        onChange={setcommitMessage}
        id="commit-message"
        error={commitMessageError}
      />
    </Form>
  );
};
