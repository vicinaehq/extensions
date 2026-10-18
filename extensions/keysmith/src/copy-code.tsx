import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Icon,
  List,
  Toast,
  getPreferenceValues,
  showToast,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import {
  KeysmithAccount,
  incrementHotpCounter,
  listKeysmithAccounts,
  normalizeConfigPath,
} from "./lib/keysmith";
import { type VaultGate, type VaultSession, legacyMasterPassword, useVault } from "./lib/vault";
import { UnlockForm } from "./components/unlock-form";
import { UnsupportedPlatform } from "./components/unsupported-platform";
import { VaultSettings } from "./components/vault-settings";
import { createHmac } from "crypto";

type CodeItem = {
  account: KeysmithAccount;
  code: string;
  validFor?: number;
};

function hashName(hash: string): "sha1" | "sha256" | "sha512" {
  const value = hash.toLowerCase();
  if (value === "sha256") return "sha256";
  if (value === "sha512") return "sha512";
  return "sha1";
}

function otp(secret: Buffer, counter: number, digits: number, hash: string): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(hashName(hash), secret).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

function totp(account: KeysmithAccount, now: number): { code: string; validFor: number } {
  const period = account.timeStep ?? 30;
  const epoch = Number.isFinite(Date.parse(account.epoch))
    ? Math.floor(Date.parse(account.epoch) / 1000)
    : 0;
  const counter = Math.floor((now - epoch) / period);
  const validFor = period - ((now - epoch) % period);
  return {
    code: otp(Buffer.from(account.secretB64, "base64"), counter, account.pinLength, account.hash),
    validFor,
  };
}

function hotp(account: KeysmithAccount): { code: string } {
  return {
    code: otp(
      Buffer.from(account.secretB64, "base64"),
      account.counter ?? 0,
      account.pinLength,
      account.hash,
    ),
  };
}

function AccountList({
  configPath,
  session,
  gate,
}: {
  configPath: string;
  session: VaultSession;
  gate: VaultGate;
}) {
  const key = session.key;
  const [accounts, setAccounts] = useState<KeysmithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    listKeysmithAccounts(configPath, key)
      .then((parsed) => {
        if (mounted) setAccounts(parsed);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (mounted) setError(message);
        showToast({
          style: Toast.Style.Failure,
          title: "Keysmith",
          message: message.slice(0, 400),
        }).catch(() => {
          // Toast display is best-effort; the error view already shows the message.
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [configPath, key, refreshCount]);

  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const items = useMemo<CodeItem[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    return accounts.map((account) => {
      if (account.type === "hotp") {
        return { account, ...hotp(account) };
      }
      return { account, ...totp(account, now) };
    });
  }, [accounts, tick]);

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read Keysmith"
          description={error}
          actions={
            <ActionPanel>
              <Action
                title="Reload"
                icon={Icon.ArrowClockwise}
                onAction={() => setRefreshCount((n) => n + 1)}
              />
              <Action title="Unlock" icon={Icon.Lock} onAction={() => void gate.lock()} />
              <Action.Push
                title="Vault Settings"
                icon={Icon.Cog}
                target={<VaultSettings gate={gate} />}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (loading) {
    return <List isLoading />;
  }

  if (items.length === 0) {
    return (
      <List searchBarPlaceholder="Search Keysmith accounts...">
        <List.EmptyView
          icon={Icon.Key}
          title="No OTP Accounts"
          description="No accounts were found in Keysmith.conf. Add your first account to get started."
          actions={
            <ActionPanel>
              <Action
                title="Reload"
                icon={Icon.ArrowClockwise}
                onAction={() => setRefreshCount((n) => n + 1)}
              />
              <Action.Push
                title="Vault Settings"
                icon={Icon.Cog}
                target={<VaultSettings gate={gate} />}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List searchBarPlaceholder="Search Keysmith accounts...">
      <List.Section
        title={`OTP Codes (${items.length})`}
        subtitle="Type the account or issuer name to filter."
      >
        {items.map((item) => {
          return (
            <List.Item
              key={item.account.id}
              title={item.account.issuer || item.account.account}
              subtitle={item.account.account}
              icon={Icon.Key}
              accessories={
                item.account.type === "totp"
                  ? [
                      { text: item.code },
                      {
                        tag: {
                          value: `${String(item.validFor ?? 0).padStart(2, "0")}s`,
                          color: (item.validFor ?? 60) < 10 ? Color.Red : Color.SecondaryText,
                        },
                      },
                    ]
                  : [
                      { text: item.code },
                      { text: `C:${String(item.account.counter ?? 0).padStart(2, "0")}` },
                    ]
              }
              actions={
                <ActionPanel>
                  {item.account.type === "hotp" ? (
                    <Action
                      title="Use Code and Increment"
                      icon={Icon.ArrowRight}
                      onAction={async () => {
                        await Clipboard.copy(item.code);
                        const ok = incrementHotpCounter(configPath, item.account.id);
                        if (!ok) {
                          await showToast({
                            style: Toast.Style.Failure,
                            title: "Keysmith",
                            message: "Failed to update HOTP counter",
                          });
                        } else {
                          setRefreshCount((n) => n + 1);
                        }
                      }}
                    />
                  ) : null}
                  <Action.CopyToClipboard title="Copy Code" content={item.code} />
                  <Action
                    title="Reload Keysmith Data"
                    icon={Icon.ArrowClockwise}
                    onAction={() => setRefreshCount((n) => n + 1)}
                  />
                  <Action.Push
                    title="Vault Settings"
                    icon={Icon.Cog}
                    target={<VaultSettings gate={gate} />}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

export default function CopyCode() {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const configPath = normalizeConfigPath(preferences.configPath);
  const gate = useVault(configPath);

  if (gate.status === "unsupported") {
    return <UnsupportedPlatform />;
  }

  if (gate.status === "loading") {
    return <List isLoading />;
  }

  if (gate.status === "unlocked" && gate.session) {
    return <AccountList configPath={configPath} session={gate.session} gate={gate} />;
  }

  if (gate.status === "error") {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read Keysmith"
          description={gate.error ?? "Unknown error"}
          actions={
            <ActionPanel>
              <Action title="Unlock" icon={Icon.Lock} onAction={() => void gate.lock()} />
              <Action.Push
                title="Vault Settings"
                icon={Icon.Cog}
                target={<VaultSettings gate={gate} />}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <UnlockForm
      firstRun={gate.firstRun}
      defaultPassword={gate.firstRun ? legacyMasterPassword() : ""}
      onSubmit={gate.unlock}
    />
  );
}
