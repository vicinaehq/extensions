import { List, ActionPanel, Action, Clipboard, Icon, useNavigation, showToast, Toast } from "@vicinae/api";
import type { Item } from "../types/bitwarden";
import { ItemDetail } from "./item-detail";
import { RepromptForm } from "./reprompt-form";
import { useVault } from "../context/vault-provider";
import { useSession } from "../context/session-provider";
import { getPrefs, repromptGraceMs } from "../utils/prefs";
import { getRepromptTimestamp, setRepromptTimestamp } from "../api/session-store";

// Icon.Document and Icon.Globe do not exist in @vicinae/api — using Icon.BlankDocument and Icon.Globe01 as fallbacks.
const TYPE_ICON: Record<number, Icon> = {
  1: Icon.Key,
  2: Icon.BlankDocument,
  3: Icon.CreditCard,
  4: Icon.Person,
};

export function ItemList() {
  const { items, folders, isLoading, refresh } = useVault();
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? "No Folder";
  const grouped = group(items, (i) => folderName(i.folderId));

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search vault…">
      {Object.entries(grouped).map(([folder, list]) => (
        <List.Section key={folder} title={folder}>
          {list.map((item) => (
            <List.Item
              key={item.id}
              title={item.name}
              subtitle={item.login?.username ?? ""}
              keywords={item.login?.uris?.map((u) => u.uri) ?? []}
              icon={TYPE_ICON[item.type] ?? Icon.BlankDocument}
              actions={<ItemActions item={item} onChanged={refresh} />}
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

function ItemActions({ item, onChanged }: { item: Item; onChanged: () => Promise<void> }) {
  const { push } = useNavigation();
  const { state } = useSession();
  if (state.kind !== "unlocked") return null;
  const vault = state.vault;
  const prefs = getPrefs();

  const guarded = async (action: () => Promise<void>) => {
    if (item.reprompt === 1) {
      const last = await getRepromptTimestamp(item.id);
      const grace = repromptGraceMs(prefs);
      const fresh = grace !== "never" && typeof grace === "number" && last !== null && Date.now() - last < grace;
      const sessionGrace = grace === "never" && last !== null;
      if (!fresh && !sessionGrace) {
        return push(
          <RepromptForm
            onConfirmed={async () => {
              await setRepromptTimestamp(item.id);
              await action();
            }}
            onCancel={() => undefined}
          />,
        );
      }
    }
    await action();
  };

  const copyPassword = () =>
    guarded(async () => {
      const fresh = await vault.getItem(item.id);
      if (!fresh?.login?.password) {
        await showToast({ style: Toast.Style.Failure, title: "No password" });
        return;
      }
      await Clipboard.copy(fresh.login.password, { concealed: true });
    });

  const copyTotp = () =>
    guarded(async () => {
      const code = await vault.getTotp(item.id);
      if (!code) {
        await showToast({ style: Toast.Style.Failure, title: "No TOTP" });
        return;
      }
      await Clipboard.copy(code, { concealed: true });
    });

  const pastePassword = () =>
    guarded(async () => {
      const fresh = await vault.getItem(item.id);
      if (!fresh?.login?.password) return;
      await Clipboard.paste(fresh.login.password);
    });

  const uri = item.login?.uris?.[0]?.uri;

  const isLogin = item.type === 1;

  return (
    <ActionPanel>
      <Action title="Show Details" icon={Icon.Eye} onAction={() => push(<ItemDetail item={item} vault={vault} />)} />
      {isLogin && <Action title="Copy Password" icon={Icon.Key} onAction={copyPassword} shortcut={{ modifiers: ["shift"], key: "return" }} />}
      {isLogin && <Action title="Paste Password" icon={Icon.Text} onAction={pastePassword} shortcut={{ modifiers: ["cmd", "shift"], key: "return" }} />}
      {isLogin && <Action title="Copy TOTP" icon={Icon.Clock} onAction={copyTotp} shortcut={{ modifiers: ["cmd"], key: "t" }} />}
      {item.login?.username && (
        <Action
          title="Copy Username"
          icon={Icon.Person}
          shortcut={{ modifiers: ["cmd"], key: "u" }}
          onAction={async () => {
            await Clipboard.copy(item.login!.username!);
            await showToast({ style: Toast.Style.Success, title: "Username copied" });
          }}
        />
      )}
      {uri && <Action.OpenInBrowser title="Open URL" icon={Icon.Globe01} url={uri} shortcut={{ modifiers: ["cmd"], key: "o" }} />}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        onAction={onChanged}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
      />
    </ActionPanel>
  );
}

function group<T>(arr: T[], keyer: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const t of arr) (out[keyer(t)] ??= []).push(t);
  return out;
}
