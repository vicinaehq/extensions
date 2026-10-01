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
import { generatePassword, PasswordOptions } from "./pass-cli";

const randomDefaults: PasswordOptions = {
  type: "random",
  length: 20,
  includeNumbers: true,
  includeUppercase: true,
  includeSymbols: true,
};

const passphraseDefaults: PasswordOptions = {
  type: "passphrase",
  words: 4,
  separator: "hyphens",
  capitalize: true,
  includeNumbers: true,
};

export default function Command() {
  const [options, setOptions] = useState<PasswordOptions>(randomDefaults);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  async function refresh(next = options) {
    setLoading(true);
    setError(undefined);
    try {
      setPassword(await generatePassword(next));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function copy() {
    if (!password) return;
    await Clipboard.copy(password, { concealed: true });
    await showToast({ style: Toast.Style.Success, title: "Password copied" });
  }

  const nextType = options.type === "random" ? passphraseDefaults : randomDefaults;

  return (
    <List isLoading={loading} searchBarPlaceholder="Generate a Proton Pass password...">
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Unable to generate password"
          description={`${error} Check that pass-cli is installed and authenticated.`}
        />
      ) : (
        <List.Item
          title={password || "Generating..."}
          subtitle={options.type === "random" ? "Random password" : "Passphrase"}
          icon={Icon.Key}
          actions={
            <ActionPanel>
              <Action title="Copy Password" icon={Icon.Clipboard} onAction={copy} />
              <Action
                title="Generate New Password"
                icon={Icon.Shuffle}
                onAction={() => void refresh()}
              />
              <Action
                title={options.type === "random" ? "Switch to Passphrase" : "Switch to Random Password"}
                icon={Icon.Switch}
                onAction={() => {
                  setOptions(nextType);
                  void refresh(nextType);
                }}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
