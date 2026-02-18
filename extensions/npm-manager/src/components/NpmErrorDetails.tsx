import { Detail, ActionPanel, Action } from "@vicinae/api";

export const NpmErrorDetails = ({
  error,
  clear,
}: {
  error: string;
  clear: () => void;
}) => (
  <Detail
    markdown={`# Error\n\n\`\`\`\n${error}\n\`\`\``}
    actions={
      <ActionPanel>
        <Action
          title="Dismiss"
          onAction={clear}
          shortcut={{
            key: "backspace",
            modifiers: [],
          }}
        />
      </ActionPanel>
    }
  />
);
