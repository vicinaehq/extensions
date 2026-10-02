import { useEffect, useState } from "react";
import { Action, ActionPanel, Clipboard, Icon, List, showToast, Toast } from "@vicinae/api";
import { listItems, listVaults, PassItem, Vault, viewItem, getTotp } from "./pass-cli";

async function copyValue(title: string, value: string): Promise<void> {
  await Clipboard.copy(value, { concealed: true });
  await showToast({ style: Toast.Style.Success, title: `${title} copied` });
}

function VaultItems({ vault }: { vault: Vault }) {
  const [items, setItems] = useState<PassItem[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listItems(vault)
      .then(setItems)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, [vault]);

  return (
    <List isLoading={loading} navigationTitle={vault.name} searchBarPlaceholder="Search items...">
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Unable to load vault items" description={error} />
      ) : items.length === 0 && !loading ? (
        <List.EmptyView icon={Icon.Folder} title="No items in this vault" />
      ) : (
        items.map((item) => (
          <List.Item
            key={`${item.shareId}:${item.itemId}`}
            title={item.title}
            subtitle={item.username ?? item.email ?? item.type}
            icon={item.hasTotp ? Icon.Lock : Icon.Key}
            actions={
              <ActionPanel>
                {(item.username || item.email) ? (
                  <Action
                    title={item.username ? "Copy Username" : "Copy Email"}
                    icon={item.username ? Icon.Person : Icon.Envelope}
                    onAction={() => void copyValue(item.username ? "Username" : "Email", item.username ?? item.email ?? "")}
                  />
                ) : (
                  <Action title="Find Username or Email" icon={Icon.Person} onAction={() => void (async () => {
                    try {
                      const detail = await viewItem(item);
                      const value = detail.username ?? detail.email;
                      if (!value) throw new Error("This item has no username or email.");
                      await copyValue(detail.username ? "Username" : "Email", value);
                    } catch (reason: unknown) {
                      await showToast({ style: Toast.Style.Failure, title: "Unable to copy username or email", message: reason instanceof Error ? reason.message : String(reason) });
                    }
                  })()} />
                )}
                {item.username && item.email && (
                  <Action title="Copy Email" icon={Icon.Envelope} onAction={() => void copyValue("Email", item.email!)} />
                )}
                <Action title="Copy Password" icon={Icon.Key} onAction={() => void (async () => {
                  try {
                    const detail = await viewItem(item);
                    if (!detail.password) throw new Error("This item has no password.");
                    await copyValue("Password", detail.password);
                  } catch (reason: unknown) {
                    await showToast({ style: Toast.Style.Failure, title: "Unable to copy password", message: reason instanceof Error ? reason.message : String(reason) });
                  }
                })()} />
                <Action title="Copy TOTP Code" icon={Icon.Clock} onAction={() => void (async () => {
                  try {
                    await copyValue("TOTP code", await getTotp(item));
                  } catch (reason: unknown) {
                    await showToast({ style: Toast.Style.Failure, title: "Unable to copy TOTP code", message: reason instanceof Error ? reason.message : String(reason) });
                  }
                })()} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

export default function Command() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listVaults()
      .then(setVaults)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <List isLoading={loading} searchBarPlaceholder="Search Proton Pass vaults...">
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Unable to load vaults" description={error} />
      ) : vaults.length === 0 && !loading ? (
        <List.EmptyView icon={Icon.Folder} title="No vaults found" />
      ) : (
        vaults.map((vault) => (
          <List.Item
            key={vault.shareId}
            title={vault.name}
            subtitle={vault.role ?? "Proton Pass vault"}
            accessories={vault.itemCount === undefined ? [] : [{ text: `${vault.itemCount} items` }]}
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action.Push title="View Items" icon={Icon.Folder} target={<VaultItems vault={vault} />} />
                <Action title="Copy Vault Name" icon={Icon.CopyClipboard} onAction={() => void copyValue("Vault name", vault.name)} />
                <Action title="Copy Share ID" icon={Icon.CopyClipboard} onAction={() => void copyValue("Share ID", vault.shareId)} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
