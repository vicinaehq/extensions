import { Action, ActionPanel, Detail, Icon } from '@vicinae/api';

interface VaultErrorProps {
  title: string;
  message: string;
  retry?: () => void;
}

export function VaultError({ title, message, retry }: VaultErrorProps) {
  const retryHint = retry ? '\n**Press `Enter` to retry.**' : '';
  const body = `# ${title}\n\n\`\`\`\n${message}\n\`\`\`${retryHint}\n\n_Review the error text for personal info before sharing publicly._`;
  return (
    <Detail
      markdown={body}
      actions={
        <ActionPanel>
          {retry && <Action title="Retry" icon={Icon.ArrowClockwise} onAction={retry} />}
          <Action.CopyToClipboard title="Copy Error" content={message} />
        </ActionPanel>
      }
    />
  );
}
