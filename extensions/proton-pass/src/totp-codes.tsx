import { useEffect, useState } from "react";
import { Action, ActionPanel, Clipboard, Icon, List, showToast, Toast } from "@vicinae/api";
import { getTotp, listItems, listVaults, PassItem } from "./pass-cli";

export default function Command() {
  const [items, setItems] = useState<PassItem[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const vaults = await listVaults();
        const lists = await Promise.all(vaults.map((vault) => listItems(vault)));
        setItems(lists.flat().filter((item) => item.hasTotp));
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copy(item: PassItem) {
    try {
      await Clipboard.copy(await getTotp(item), { concealed: true });
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
    <List isLoading={loading} searchBarPlaceholder="Search TOTP items...">
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Unable to load TOTP codes"
          description={`${error} Check that pass-cli is installed and authenticated.`}
        />
      ) : items.length === 0 && !loading ? (
        <List.EmptyView icon={Icon.Clock} title="No TOTP items found" />
      ) : (
        items.map((item) => (
          <List.Item
            key={`${item.shareId}:${item.itemId}`}
            title={item.title}
            subtitle={item.vaultName}
            icon={Icon.Clock}
            actions={<ActionPanel><Action title="Copy TOTP Code" icon={Icon.CopyClipboard} onAction={() => void copy(item)} /></ActionPanel>}
          />
        ))
      )}
    </List>
  );
}
