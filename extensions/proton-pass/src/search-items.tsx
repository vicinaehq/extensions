import { useEffect, useState } from "react";
import { Action, ActionPanel, Clipboard, Icon, List, showToast, Toast } from "@vicinae/api";
import { getTotp, listAllItems, PassItem, viewItem } from "./pass-cli";

async function copyValue(title: string, value: string): Promise<void> {
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
      {item.username && (
        <Action title="Copy Username" icon={Icon.Person} onAction={() => void safely(() => copyValue("Username", item.username!))} />
      )}
      {item.email && (
        <Action title="Copy Email" icon={Icon.Envelope} onAction={() => void safely(() => copyValue("Email", item.email!))} />
      )}
      <Action
        title="Copy Username or Email"
        icon={Icon.Person}
        onAction={() => void safely(async () => {
          const detail = await viewItem(item);
          const value = detail.username ?? detail.email;
          if (!value) throw new Error("This item has no username or email.");
          await copyValue("Username or email", value);
        })}
      />
      <Action
        title="Copy Password"
        icon={Icon.Key}
        onAction={() => void safely(async () => {
          const detail = await viewItem(item);
          if (!detail.password) throw new Error("This item has no password.");
          await copyValue("Password", detail.password);
        })}
      />
      <Action
        title="Copy TOTP Code"
        icon={Icon.Clock}
        onAction={() => void safely(async () => copyValue("TOTP code", await getTotp(item)))}
      />
    </ActionPanel>
  );
}

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

  return (
    <List isLoading={loading} searchBarPlaceholder="Search Proton Pass items...">
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Unable to load Proton Pass"
          description={`${error} Check that pass-cli is installed and authenticated.`}
        />
      ) : items.length === 0 && !loading ? (
        <List.EmptyView icon={Icon.Key} title="No Proton Pass items found" />
      ) : (
        items.map((item) => (
          <List.Item
            key={`${item.shareId}:${item.itemId}`}
            title={item.title}
            subtitle={item.username ?? item.email ?? item.vaultName}
            keywords={[item.title, item.username ?? "", item.email ?? "", item.vaultName, item.type]}
            icon={item.hasTotp ? Icon.Lock : Icon.Key}
            accessories={[{ text: item.vaultName }, ...(item.hasTotp ? [{ icon: Icon.Clock, tooltip: "Has TOTP" }] : [])]}
            actions={<ItemActions item={item} />}
          />
        ))
      )}
    </List>
  );
}
