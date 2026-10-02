import { useEffect, useState } from "react";
import { Action, ActionPanel, Clipboard, Icon, List, showToast, Toast } from "@vicinae/api";
import { getTotp, listAllItems, PassItem } from "./pass-cli";

export default function Command() {
  const [items, setItems] = useState<PassItem[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listAllItems()
      .then(setItems)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, []);

  async function copy(item: PassItem): Promise<void> {
    try {
      const code = await getTotp(item);
      await Clipboard.copy(code, { concealed: true });
      await showToast({ style: Toast.Style.Success, title: `${item.title} TOTP copied` });
    } catch (reason: unknown) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to copy TOTP code",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  return (
    <List isLoading={loading} searchBarPlaceholder="Search all items, then choose one for TOTP...">
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Unable to load Proton Pass items" description={error} />
      ) : items.length === 0 && !loading ? (
        <List.EmptyView icon={Icon.Clock} title="No Proton Pass items found" />
      ) : (
        items.map((item) => (
          <List.Item
            key={`${item.shareId}:${item.itemId}`}
            title={item.title}
            subtitle={item.vaultName}
            keywords={[item.title, item.username ?? "", item.email ?? "", item.vaultName]}
            icon={item.hasTotp ? Icon.Clock : Icon.Key}
            accessories={item.hasTotp ? [{ text: "TOTP" }] : [{ text: "Try TOTP" }]}
            actions={
              <ActionPanel>
                <Action title="Copy TOTP Code" icon={Icon.CopyClipboard} onAction={() => void copy(item)} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
