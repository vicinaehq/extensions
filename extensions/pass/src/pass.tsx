import { useCallback, useEffect, useMemo, useState } from "react";
import { Action, ActionPanel, Icon, List, Toast, showToast } from "@vicinae/api";
import { getPreferences } from "@/preferences";
import { listPasswordEntries, decryptPasswordEntry } from "@/services/passctl";
import { getLastUsedPassword } from "@/storage/last-used";
import { buildPasswordOptions } from "@/utils/password";
import { performPasswordAction } from "@/utils/actions";
import { getEntryIcon, getOptionIcon } from "@/utils/icons";
import { PasswordEntry, PasswordOption } from "@/types";

type CommandState = {
  entries: PasswordEntry[];
  isLoading: boolean;
  error?: string;
};

export default function Command() {
  const preferences = useMemo(() => getPreferences(), []);
  const [state, setState] = useState<CommandState>({
    entries: [],
    isLoading: true,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: undefined }));
    try {
      const [entries, lastUsed] = await Promise.all([
        listPasswordEntries(preferences.passwordStorePath),
        getLastUsedPassword(preferences.lastUsedTtlSeconds),
      ]);
      const ordered = orderEntries(entries, lastUsed?.password, lastUsed?.option);
      setState({ entries: ordered, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      await showToast({ style: Toast.Style.Failure, title: "Failed to load passwords", message });
      setState({ entries: [], isLoading: false, error: message });
    }
  }, [preferences]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <List isLoading={state.isLoading} searchBarPlaceholder="Search passwords">
      {state.error ? (
        <List.EmptyView
          title="Password store unavailable"
          description={state.error}
          actions={
            <ActionPanel>
              <Action title="Reload" icon={Icon.RotateAntiClockwise} onAction={refresh} />
            </ActionPanel>
          }
        />
      ) : state.entries.length === 0 ? (
        <List.EmptyView
          title="No passwords found"
          description="Create entries with 'pass insert' and reload this command."
          actions={
            <ActionPanel>
              <Action title="Reload" icon={Icon.RotateAntiClockwise} onAction={refresh} />
            </ActionPanel>
          }
        />
      ) : (
        state.entries.map((entry) => (
          <List.Item
            key={entry.value}
            title={entry.value}
            icon={getEntryIcon(entry.value)}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Secrets"
                  icon={Icon.Key}
                  target={<PasswordOptionsView password={entry.value} showOtpFirst={entry.showOtpFirst} />}
                />
                <Action title="Reload" icon={Icon.RotateAntiClockwise} onAction={refresh} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );

  function PasswordOptionsView({ password, showOtpFirst }: { password: string; showOtpFirst?: boolean }) {
    const [isLoading, setIsLoading] = useState(true);
    const [options, setOptions] = useState<PasswordOption[]>([]);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
      let disposed = false;
      setIsLoading(true);
      setError(undefined);

      (async () => {
        try {
          const plaintext = await decryptPasswordEntry(password, preferences);
          const { options: parsed, warnings } = await buildPasswordOptions({
            plaintext,
            preferences,
            prioritizeOtp: Boolean(showOtpFirst && preferences.otpAfterPassword),
          });

          if (!disposed) {
            setOptions(parsed);
            setIsLoading(false);
          }

          if (warnings.length > 0) {
            await showToast({
              style: Toast.Style.Animated,
              title: "Partial data",
              message: warnings.join(". "),
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unable to decrypt entry";
          if (!disposed) {
            setError(message);
            setOptions([]);
            setIsLoading(false);
          }
          await showToast({ style: Toast.Style.Failure, title: "Decryption failed", message });
        }
      })();

      return () => {
        disposed = true;
      };
    }, [password, preferences, showOtpFirst]);

    return (
      <List isLoading={isLoading} searchBarPlaceholder="Select a field to copy/paste">
        {error ? (
          <List.EmptyView title="Unable to read entry" description={error} />
        ) : options.length === 0 ? (
          <List.EmptyView title="No fields found" description="The decrypted file is empty." />
        ) : (
          options.map((option, index) => (
            <List.Item
              key={`${option.title}-${index}`}
              title={option.title}
              icon={getOptionIcon(option.title)}
              actions={
                <ActionPanel>
                  <Action
                    title="Paste"
                    icon={Icon.Keyboard}
                    onAction={() => performPasswordAction(password, option, "paste")}
                  />
                  <Action
                    title="Copy to Clipboard"
                    icon={Icon.CopyClipboard}
                    onAction={() => performPasswordAction(password, option, "copy")}
                  />
                </ActionPanel>
              }
            />
          ))
        )}
      </List>
    );
  }
}

function orderEntries(entries: string[], lastUsed?: string | null, lastUsedOption?: string | null): PasswordEntry[] {
  const mapped = entries.map<PasswordEntry>((value) => ({ value }));

  if (!lastUsed) {
    return mapped;
  }

  const index = mapped.findIndex((entry) => entry.value === lastUsed);
  if (index === -1) {
    return [{ value: lastUsed, showOtpFirst: lastUsedOption === "Password" }, ...mapped];
  }

  const [entry] = mapped.splice(index, 1);
  return [{ ...entry, showOtpFirst: lastUsedOption === "Password" }, ...mapped];
}
