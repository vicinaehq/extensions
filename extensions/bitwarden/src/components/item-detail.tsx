import { Detail, ActionPanel, Action, Clipboard, Icon, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import type { Item } from "../types/bitwarden";
import type { Vault } from "../api/vault";

export function ItemDetail({ item, vault }: { item: Item; vault: Vault }) {
  const [full, setFull] = useState<Item>(item);
  const [totp, setTotp] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await vault.getItem(item.id);
        if (!cancelled && fresh) setFull(fresh);
      } catch { /* keep stub */ }
      try {
        const code = await vault.getTotp(item.id);
        if (!cancelled && code) setTotp(code);
      } catch { /* no totp */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [item.id, vault]);

  const md = `# ${full.name}${loading ? "\n\n_Loading…_" : ""}${full.notes ? `\n\n## Notes\n\n${full.notes}` : ""}`;

  return (
    <Detail
      markdown={md}
      metadata={
        <Detail.Metadata>
          {full.login?.username && <Detail.Metadata.Label title="Username" text={full.login.username} icon={Icon.Person} />}
          {full.login?.password && (
            <Detail.Metadata.Label
              title="Password"
              text={revealed ? full.login.password : "••••••••"}
              icon={revealed ? Icon.LockUnlocked : Icon.Lock}
            />
          )}
          {totp && <Detail.Metadata.Label title="TOTP" text={totp} icon={Icon.Clock} />}
          {full.login?.uris?.length ? <Detail.Metadata.Separator /> : null}
          {full.login?.uris?.map((u, i) => (
            <Detail.Metadata.Link key={`uri-${i}`} title={i === 0 ? "URL" : " "} target={u.uri} text={u.uri} />
          ))}
          {full.card && (
            <>
              <Detail.Metadata.Separator />
              {full.card.cardholderName && <Detail.Metadata.Label title="Cardholder" text={full.card.cardholderName} />}
              {full.card.brand && <Detail.Metadata.Label title="Brand" text={full.card.brand} />}
              {full.card.number && <Detail.Metadata.Label title="Number" text={revealed ? full.card.number : "••••••••"} />}
              {(full.card.expMonth || full.card.expYear) && (
                <Detail.Metadata.Label title="Expires" text={`${full.card.expMonth ?? ""}/${full.card.expYear ?? ""}`} />
              )}
              {full.card.code && <Detail.Metadata.Label title="CVV" text={revealed ? full.card.code : "•••"} />}
            </>
          )}
          {full.identity && (
            <>
              <Detail.Metadata.Separator />
              {full.identity.firstName && <Detail.Metadata.Label title="First Name" text={full.identity.firstName} />}
              {full.identity.lastName && <Detail.Metadata.Label title="Last Name" text={full.identity.lastName} />}
              {full.identity.email && <Detail.Metadata.Label title="Email" text={full.identity.email} />}
              {full.identity.phone && <Detail.Metadata.Label title="Phone" text={full.identity.phone} />}
            </>
          )}
          {full.fields && full.fields.length > 0 && (
            <>
              <Detail.Metadata.Separator />
              {full.fields.map((f, i) => (
                <Detail.Metadata.Label
                  key={`field-${i}`}
                  title={f.name}
                  text={f.type === 1 && !revealed ? "••••••••" : (f.value ?? "")}
                />
              ))}
            </>
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {full.login?.password && (
            <Action
              title="Copy Password"
              icon={Icon.Key}
              shortcut={{ modifiers: ["shift"], key: "return" }}
              onAction={async () => {
                await Clipboard.copy(full.login!.password!, { concealed: true });
                await showToast({ style: Toast.Style.Success, title: "Password copied" });
              }}
            />
          )}
          {totp && (
            <Action
              title="Copy TOTP"
              icon={Icon.Clock}
              shortcut={{ modifiers: ["cmd"], key: "t" }}
              onAction={async () => {
                await Clipboard.copy(totp, { concealed: true });
                await showToast({ style: Toast.Style.Success, title: "TOTP copied", message: totp });
              }}
            />
          )}
          {full.login?.username && (
            <Action
              title="Copy Username"
              icon={Icon.Person}
              shortcut={{ modifiers: ["cmd"], key: "u" }}
              onAction={async () => {
                await Clipboard.copy(full.login!.username!);
                await showToast({ style: Toast.Style.Success, title: "Username copied" });
              }}
            />
          )}
          {full.login?.password && (
            <Action
              title={revealed ? "Hide Password" : "Reveal Password"}
              icon={revealed ? Icon.LockDisabled : Icon.Eye}
              shortcut={{ modifiers: ["cmd"], key: "h" }}
              onAction={() => setRevealed((r) => !r)}
            />
          )}
          {full.login?.uris?.[0]?.uri && (
            <Action.OpenInBrowser
              title="Open URL"
              icon={Icon.Globe01}
              url={full.login.uris[0].uri}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
