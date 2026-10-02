import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { getTotp, listItems, listVaults, PassItem, viewItem } from "./pass-cli";

async function loadAllItems(): Promise<PassItem[]> {
  const vaults = await listVaults();
  const lists = await Promise.all(vaults.map((vault) => listItems(vault)));
  return lists.flat().sort((a, b) => a.title.localeCompare(b.title));
}

async function copySecret(title: string, value: string): Promise<void> {
  await Clipboard.copy(value, { concealed: true });
  await showToast({ style: Toast.Style.Success, title: `${title} copied` });
}

function ItemActions({ item }: { item: PassItem }) {
  async function safely(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (reason: unknown) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Proton Pass action failed",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  return (
    <ActionPanel>
      {(item.username || item.email) ? (
        <Action
          title={item.username ? "Copy Username" : "Copy Email"}
          icon={item.username ? Icon.Person : Icon.Envelope}
          onAction={() => safely(() => copySecret(item.username ? "Username" : "Email", item.username ?? item.email ?? ""))}
        />
      ) : (
        <Action
          title="Find Username or Email"
          icon={Icon.Person}
          onAction={() => safely(async () => {
            const detail = await viewItem(item);
            const value = detail.username ?? detail.email;
            if (!value) throw new Error("This item has no username or email.");
            await copySecret(detail.username ? "Username" : "Email", value);
          })}
        />
      )}
      {item.username && item.email && (
        <Action
          title="Copy Email"
          icon={Icon.Envelope}
          onAction={() => safely(() => copySecret("Email", item.email!))}
        />
      )}
      <Action
        title="Copy Password"
        icon={Icon.Key}
        onAction={() => safely(async () => {
          const detail = await viewItem(item);
          if (!detail.password) throw new Error("This item has no password.");
          await copySecret("Password", detail.password);
        })}
      />
      {item.hasTotp && (
        <Action
          title="Copy TOTP Code"
          icon={Icon.Clock}
          onAction={() => safely(async () => copySecret("TOTP code", await getTotp(item)))}
        />
      )}
    </ActionPanel>
  );
}

export default function Command() {
  const [items, setItems] = useState<PassItem[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAllItems()
      .then(setItems)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <List isLoading={loading} searchBarPlaceholder="Search Proton Pass items...">
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Unable to load Proton Pass"
          description={`${error} Check that pass-cli is installed, authenticated, and configured in Vicinae preferences.`}
        />
      ) : items.length === 0 && !loading ? (
        <List.EmptyView icon={Icon.Key} title="No Proton Pass items found" />
      ) : (
        items.map((item) => (
          <List.Item
            key={`${item.shareId}:${item.itemId}`}
            title={item.title}
            subtitle={item.username ?? item.email ?? item.vaultName}
            keywords={[item.title, item.username ?? "", item.email ?? "", item.vaultName]}
            icon={item.hasTotp ? Icon.Lock : Icon.Key}
            accessories={[{ text: item.vaultName }]}
            actions={<ItemActions item={item} />}
          />
        ))
      )}
    </List>
  );
}
