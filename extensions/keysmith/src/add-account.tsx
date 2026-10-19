import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  closeMainWindow,
  getPreferenceValues,
  showToast,
  Toast,
} from "@vicinae/api";
import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { useState } from "react";
import { promisify } from "util";
import {
  type HashAlgorithm,
  addKeysmithAccount,
  base32Decode,
  keysmithHashName,
  normalizeConfigPath,
} from "./lib/keysmith";
import { parseOtpUrl } from "./lib/otp";
import { decodeQrImage } from "./lib/qr";
import { type VaultSession, legacyMasterPassword, useVault } from "./lib/vault";
import { UnlockForm } from "./components/unlock-form";
import { UnsupportedPlatform } from "./components/unsupported-platform";

const execFileAsync = promisify(execFile);

type AccountFields = {
  account: string;
  issuer: string;
  secret: string;
  type: "totp" | "hotp";
  digits: number;
  timeStep: number;
  counter: number;
  algorithm: string;
};

/** Keeps a numeric form field inside the range the OTP spec and Keysmith accept. */
function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/** Reads the normalized algorithm name a QR carried back into a dropdown value. */
function algorithmOption(value: string): HashAlgorithm {
  const name = keysmithHashName(value);
  if (name === "Sha256") return "sha256";
  if (name === "Sha512") return "sha512";
  return "sha1";
}

/**
 * Deletes a captured QR screenshot. It holds an OTP secret in the clear, so it
 * must not outlive the scan. A missing file is fine, but any other failure means
 * the secret may still be on disk: that gets a warning with the path. This never
 * throws, so it cannot replace the scan result with a cleanup error.
 */
async function discardScreenshot(file: string): Promise<void> {
  try {
    await fs.promises.unlink(file);
  } catch (error) {
    const code = (error as { code?: unknown } | null | undefined)?.code;
    if (code === "ENOENT") {
      // The capture failed before writing anything, or the file is already gone.
      return;
    }
    await showToast({
      title: "Screenshot not deleted",
      message: `The QR screenshot may still contain your OTP secret at ${file}. Delete it by hand.`,
      style: Toast.Style.Failure,
    }).catch(() => {
      // Reporting the leftover file is best-effort too.
    });
  }
}

async function decodeAndApply(
  imagePath: string,
  fill: (fields: AccountFields) => void,
): Promise<boolean> {
  const text = await decodeQrImage(imagePath);
  if (!text) {
    await showToast({
      title: "No QR code found",
      message:
        "Could not find a QR code in that image. Try a clearer screenshot or enter the details manually.",
      style: Toast.Style.Failure,
    });
    return false;
  }
  const url = parseOtpUrl(text);
  if (!url) {
    await showToast({
      title: "Not an OTP QR code",
      message: "The QR code does not contain an OTP setup code.",
      style: Toast.Style.Failure,
    });
    return false;
  }
  fill({
    account: url.account,
    issuer: url.issuer,
    secret: url.secret,
    type: url.type,
    digits: url.digits,
    timeStep: url.timeStep,
    counter: url.counter,
    algorithm: url.algorithm,
  });
  await showToast({
    title: "QR code detected",
    message: "Account details filled in. Review and submit.",
  });
  return true;
}

function AddAccountForm({ configPath, session }: { configPath: string; session: VaultSession }) {
  const [account, setAccount] = useState("");
  const [issuer, setIssuer] = useState("");
  const [secret, setSecret] = useState("");
  const [type, setType] = useState<"totp" | "hotp">("totp");
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>("sha1");
  const [digits, setDigits] = useState("6");
  const [period, setPeriod] = useState("30");
  const [counter, setCounter] = useState("0");

  function fillForm(fields: AccountFields) {
    setAccount(fields.account);
    setIssuer(fields.issuer);
    setSecret(fields.secret);
    setType(fields.type);
    setAlgorithm(algorithmOption(fields.algorithm));
    setDigits(String(fields.digits));
    setPeriod(String(fields.timeStep));
    setCounter(String(fields.counter));
  }

  async function handleQrFile(paths: string[]) {
    const file = paths[0];
    if (!file) return;
    try {
      await decodeAndApply(file, fillForm);
    } catch (error) {
      await showToast({
        title: "Could not read image",
        message: error instanceof Error ? error.message : String(error),
        style: Toast.Style.Failure,
      });
    }
  }

  async function handleScreenshot() {
    const output = path.join(os.tmpdir(), `vicinae-keysmith-qr-${Date.now()}.png`);
    try {
      try {
        await execFileAsync("spectacle", ["-r", "-b", "-n", "-o", output], { timeout: 120000 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ENOENT")) {
          await showToast({
            title: "Spectacle not found",
            message: "Install Spectacle or pick a QR image file instead.",
            style: Toast.Style.Failure,
          });
        } else {
          await showToast({
            title: "Screenshot cancelled",
            message: "No screenshot was captured.",
          });
        }
        return;
      }
      try {
        await decodeAndApply(output, fillForm);
      } catch (error) {
        await showToast({
          title: "Could not read screenshot",
          message: error instanceof Error ? error.message : String(error),
          style: Toast.Style.Failure,
        });
      }
    } finally {
      await discardScreenshot(output);
    }
  }

  async function handleSubmit(values: Record<string, unknown>) {
    const name = String(values.account ?? "").trim();
    const issuerValue = String(values.issuer ?? "").trim();
    const secretValue = String(values.secret ?? "")
      .trim()
      .replace(/\s/g, "");
    const otpType = String(values.type ?? "totp") === "hotp" ? "hotp" : "totp";
    // Labels and hashes come from the scanned QR when there is one, and from the
    // shown fields otherwise. Defaults match Keysmith (6 digits, SHA-1, 30 s).
    const hashValue = keysmithHashName(String(values.algorithm ?? "sha1"));
    const digitsValue = boundedInt(values.digits, 6, 1, 10);
    const periodValue = boundedInt(values.period, 30, 1, 86400);
    const counterValue = boundedInt(values.counter, 0, 0, Number.MAX_SAFE_INTEGER);

    if (!name || !secretValue) {
      await showToast({
        title: "Missing fields",
        message: "Scan a QR code or enter the account name and secret.",
        style: Toast.Style.Failure,
      });
      return;
    }

    if (!base32Decode(secretValue)) {
      await showToast({
        title: "Invalid secret",
        message: "The secret must be a valid Base32 code, like the one shown next to the QR code.",
        style: Toast.Style.Failure,
      });
      return;
    }

    try {
      await addKeysmithAccount(configPath, session.key, {
        account: name,
        issuer: issuerValue,
        type: otpType,
        hash: hashValue,
        pinLength: digitsValue,
        timeStep: periodValue,
        counter: counterValue,
        secret: secretValue,
      });
      await showToast({ title: "Account added", message: "The account was added to Keysmith." });
      await closeMainWindow();
    } catch (error) {
      await showToast({
        title: "Could not add account",
        message: error instanceof Error ? error.message : String(error),
        style: Toast.Style.Failure,
      });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Account" icon={Icon.Plus} onSubmit={handleSubmit} />
          <Action
            title="Scan QR from Screen"
            icon={Icon.Camera}
            shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
            onAction={handleScreenshot}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Scan a QR code from a file or straight from the screen, or enter the details manually like in Keysmith or Aegis." />
      <Form.FilePicker
        id="qrImage"
        title="QR Image File"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        onChange={handleQrFile}
      />
      <Form.Description text="Tip: press Cmd+Shift+S or pick Scan QR from Screen to select a QR code on screen with Spectacle." />
      <Form.Separator />
      <Form.TextField
        id="issuer"
        title="Issuer"
        value={issuer}
        onChange={setIssuer}
        placeholder="Google"
      />
      <Form.TextField
        id="account"
        title="Account Name"
        value={account}
        onChange={setAccount}
        placeholder="user@example.com"
      />
      <Form.TextField
        id="secret"
        title="Secret"
        value={secret}
        onChange={setSecret}
        placeholder="Secret shown next to the QR code"
      />
      <Form.Dropdown
        id="type"
        title="Type"
        value={type}
        onChange={(value) => setType(value as "totp" | "hotp")}
      >
        <Form.Dropdown.Item value="totp" title="TOTP (time-based)" />
        <Form.Dropdown.Item value="hotp" title="HOTP (counter-based)" />
      </Form.Dropdown>
      <Form.Dropdown
        id="algorithm"
        title="Algorithm"
        value={algorithm}
        onChange={(value) => setAlgorithm(value as HashAlgorithm)}
      >
        <Form.Dropdown.Item value="sha1" title="SHA-1" />
        <Form.Dropdown.Item value="sha256" title="SHA-256" />
        <Form.Dropdown.Item value="sha512" title="SHA-512" />
      </Form.Dropdown>
      <Form.TextField
        id="digits"
        title="Digits"
        value={digits}
        onChange={setDigits}
        placeholder="6"
      />
      {type === "totp" ? (
        <Form.TextField
          id="period"
          title="Period (seconds)"
          value={period}
          onChange={setPeriod}
          placeholder="30"
        />
      ) : (
        <Form.TextField
          id="counter"
          title="Counter"
          value={counter}
          onChange={setCounter}
          placeholder="0"
        />
      )}
    </Form>
  );
}

export default function AddAccount() {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const configPath = normalizeConfigPath(preferences.configPath);
  const gate = useVault(configPath);

  if (gate.status === "unsupported") {
    return <UnsupportedPlatform />;
  }

  if (gate.status === "loading") {
    return <Form isLoading />;
  }

  if (gate.status === "unlocked" && gate.session) {
    if (!gate.session.verified) {
      // The password could not be checked against any account. Writing here
      // would risk an entry Keysmith can never open.
      return (
        <List>
          <List.EmptyView
            icon={Icon.Warning}
            title="Vault could not be verified"
            description="Your vault has no accounts, so the master password could not be confirmed. Add an account in Keysmith first, then unlock here."
            actions={
              <ActionPanel>
                <Action title="Unlock" icon={Icon.Lock} onAction={() => void gate.lock()} />
              </ActionPanel>
            }
          />
        </List>
      );
    }
    return <AddAccountForm configPath={configPath} session={gate.session} />;
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
