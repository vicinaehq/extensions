import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  Keyboard,
  List,
  Toast,
  closeMainWindow,
  environment,
  getPreferenceValues,
  showHUD,
  showToast,
} from "@vicinae/api";
import { execFile, type ExecFileException } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { useEffect, useState } from "react";

interface Preferences {
  ykmanPath?: string;
  ykoathPath?: string;
  backend?: BackendPreference;
  primaryAction: ActionType;
  debugLogging?: boolean;
}

interface Account {
  name: string;
  details: string;
  key: string;
}

interface AccountState {
  accounts: Account[];
  isLoading: boolean;
  error?: string;
  requiresPassword: boolean;
}

interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  requiresPassword?: boolean;
}

interface PasswordFormValues {
  password?: string;
  remember?: boolean;
}

interface DebugEntry {
  elapsedMs: number;
  event: string;
  data: Record<string, unknown>;
}

enum ActionType {
  Copy = "copy",
  Paste = "paste",
}

enum Backend {
  Auto = "auto",
  Ykoath = "ykoath",
  Ykman = "ykman",
}

type BackendPreference = Backend | "ykoath-rs";

const preferences = getPreferenceValues<Preferences>();
const debugSessionStartedAt = performance.now();
const debugEntries: DebugEntry[] = [];
const maxDebugEntries = 200;
const copyShortcut = Keyboard.Shortcut.Common.Copy as Keyboard.Shortcut.Common;

let sessionPassword: string | undefined;
let nextYkmanCommandId = 1;

export default function Command() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [revealedAccount, setRevealedAccount] = useState<Account>();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [authError, setAuthError] = useState<string>();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { accounts, isLoading, error, requiresPassword } = useAccounts(refreshKey);

  const primaryAction = preferences.primaryAction === ActionType.Paste ? ActionType.Paste : ActionType.Copy;
  const secondaryAction = primaryAction === ActionType.Copy ? ActionType.Paste : ActionType.Copy;

  useEffect(() => {
    debugLog("command.actions.config", {
      primaryAction,
      secondaryAction,
      copyShortcut: "enter",
      revealShortcut: "shift+enter",
      pasteShortcut: "ctrl+return",
      actionOrder: [primaryAction, "reveal", secondaryAction],
    });
  }, [primaryAction, secondaryAction]);

  async function handlePasswordSubmit(password: string, remember: boolean) {
    setIsAuthenticating(true);
    setAuthError(undefined);

    const authResult = await testAuthentication(password);
    if (!authResult.success) {
      setAuthError(authResult.error || "Authentication failed");
      setIsAuthenticating(false);
      return;
    }

    sessionPassword = password;

    if (remember) {
      const rememberResult = await rememberPassword(password);
      if (!rememberResult.success) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to remember password",
          message: rememberResult.error,
        });
      }
    }

    setIsAuthenticating(false);
    setShowPasswordForm(false);
    setRefreshKey((current) => current + 1);
    await showToast({ style: Toast.Style.Success, title: "YubiKey unlocked" });
  }

  if (requiresPassword || showPasswordForm) {
    return (
      <PasswordForm
        error={authError}
        isAuthenticating={isAuthenticating}
        onSubmit={handlePasswordSubmit}
      />
    );
  }

  if (revealedAccount) {
    return (
      <CodeDetail
        account={revealedAccount}
        onBack={() => setRevealedAccount(undefined)}
        onRequiresPassword={() => setShowPasswordForm(true)}
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search YubiKey accounts..."
      actions={
        <ActionPanel>
          <DebugActions />
        </ActionPanel>
      }
    >
      {!isLoading && accounts.length === 0 ? (
        <List.EmptyView
          title="No accounts found"
          description={error || "Add OATH accounts with ykman or Yubico Authenticator, then refresh."}
        />
      ) : null}

      {accounts.map((account) => (
        <List.Item
          key={account.key}
          title={account.name}
          subtitle={account.details}
          accessories={[{ text: "OATH" }]}
          actions={
            <ActionPanel>
              <CodeAction
                account={account}
                actionType={primaryAction}
                onRequiresPassword={() => setShowPasswordForm(true)}
              />
              <Action
                title="Reveal Code"
                shortcut={{ modifiers: ["shift"], key: "enter" }}
                onAction={() => {
                  debugLog("reveal.action.invoke", {
                    accountId: accountDebugId(account.key),
                    shortcut: "shift+enter",
                  });
                  setRevealedAccount(account);
                }}
              />
              <CodeAction
                account={account}
                actionType={secondaryAction}
                shortcut={secondaryAction === ActionType.Paste ? { modifiers: ["ctrl"], key: "return" } : undefined}
                onRequiresPassword={() => setShowPasswordForm(true)}
              />
              <Action
                title="Refresh Accounts"
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={() => setRefreshKey((current) => current + 1)}
              />
              <Action
                title="Forget Remembered Password"
                style="destructive"
                shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
                onAction={async () => {
                  const result = await forgetPassword();
                  if (result.success) {
                    sessionPassword = undefined;
                    setRefreshKey((current) => current + 1);
                    await showToast({ style: Toast.Style.Success, title: "Password forgotten" });
                  } else {
                    await showToast({
                      style: Toast.Style.Failure,
                      title: "Failed to forget password",
                      message: result.error,
                    });
                  }
                }}
              />
              <DebugActions />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function PasswordForm(props: {
  error?: string;
  isAuthenticating: boolean;
  onSubmit: (password: string, remember: boolean) => void;
}) {
  const { error, isAuthenticating, onSubmit } = props;

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={isAuthenticating ? "Authenticating..." : "Authenticate"}
            onSubmit={(values: PasswordFormValues) => {
              const password = values.password?.trim();
              if (!password) {
                showToast({ style: Toast.Style.Failure, title: "Password is required" });
                return;
              }

              onSubmit(password, Boolean(values.remember));
            }}
          />
        </ActionPanel>
      }
    >
      <Form.PasswordField
        id="password"
        title="OATH Password"
        info="This YubiKey's OATH applet is password protected."
        error={error}
      />
      <Form.Checkbox id="remember" title="Remember Password" label="Remember password using ykman" />
    </Form>
  );
}

function CodeAction(props: {
  account: Account;
  actionType: ActionType.Copy | ActionType.Paste;
  shortcut?: Keyboard.Shortcut | Keyboard.Shortcut.Common;
  onRequiresPassword: () => void;
}) {
  const { account, actionType, shortcut, onRequiresPassword } = props;
  const title = actionType === ActionType.Copy ? "Copy Code" : "Paste Code";

  return (
    <Action
      title={title}
      shortcut={shortcut || (actionType === ActionType.Copy ? copyShortcut : undefined)}
      onAction={async () => {
        debugLog("code.action.invoke", {
          actionType,
          accountId: accountDebugId(account.key),
          title,
          shortcut: formatShortcut(shortcut || (actionType === ActionType.Copy ? copyShortcut : undefined)),
        });
        await performCodeAction(account, actionType, onRequiresPassword);
      }}
    />
  );
}

function CodeDetail(props: { account: Account; onBack?: () => void; onRequiresPassword: () => void }) {
  const { account, onBack, onRequiresPassword } = props;
  const [code, setCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    debugLog("reveal.view.mount", { accountId: accountDebugId(account.key) });

    async function revealCode() {
      setIsLoading(true);
      setError(undefined);

      const result = await getAccountCode(account.key);
      if (isCancelled) {
        return;
      }

      if (result.requiresPassword) {
        setIsLoading(false);
        debugLog("reveal.view.password_required", { accountId: accountDebugId(account.key) });
        onRequiresPassword();
        return;
      }

      if (!result.success || !result.output) {
        setIsLoading(false);
        setError(result.error || "Failed to get code");
        debugLog("reveal.view.failed", {
          accountId: accountDebugId(account.key),
          error: result.error,
        });
        return;
      }

      setCode(result.output.trim());
      setIsLoading(false);
      debugLog("reveal.view.loaded", {
        accountId: accountDebugId(account.key),
        outputLength: result.output.trim().length,
      });
    }

    revealCode();

    return () => {
      isCancelled = true;
      debugLog("reveal.view.unmount", { accountId: accountDebugId(account.key) });
    };
  }, [account.key, onRequiresPassword]);

  const markdown = error ? `# Failed to get code\n\n${error}` : code ? `# ${code}` : "# Getting code...";

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Account" text={account.key} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {code ? (
            <>
              {onBack ? (
                <Action
                  title="Back to Accounts"
                  onAction={() => {
                    debugLog("reveal.back.invoke", { accountId: accountDebugId(account.key) });
                    onBack();
                  }}
                />
              ) : null}
              <Action
                title="Copy Code"
                shortcut={copyShortcut}
                onAction={async () => {
                  debugLog("reveal.copy.invoke", { accountId: accountDebugId(account.key) });
                  await Clipboard.copy(code, { concealed: true });
                  await showHUD("Copied OTP code");
                }}
              />
              <Action
                title="Paste Code"
                onAction={async () => {
                  debugLog("reveal.paste.invoke", { accountId: accountDebugId(account.key) });
                  void closeMainWindow();
                  void Clipboard.paste(code);
                  debugLog("reveal.paste.dispatched", { accountId: accountDebugId(account.key) });
                }}
              />
            </>
          ) : null}
          <DebugActions />
        </ActionPanel>
      }
    />
  );
}

function DebugActions() {
  if (!shouldEmitExternalDebugLogs()) {
    return null;
  }

  return (
    <>
      <Action.Push title="Show Debug Timings" target={<DebugDetail />} />
      <Action
        title="Copy Debug Timings"
        onAction={async () => {
          await Clipboard.copy(formatDebugEvents(), { concealed: true });
          await showToast({ style: Toast.Style.Success, title: "Copied debug timings" });
        }}
      />
    </>
  );
}

function DebugDetail() {
  const [logs] = useState(() => formatDebugEvents());

  return (
    <Detail
      markdown={`# Debug Timings\n\n\`\`\`json\n${logs}\n\`\`\``}
      actions={
        <ActionPanel>
            <Action
              title="Copy Debug Timings"
              shortcut={copyShortcut}
            onAction={async () => {
              await Clipboard.copy(logs, { concealed: true });
              await showToast({ style: Toast.Style.Success, title: "Copied debug timings" });
            }}
          />
        </ActionPanel>
      }
    />
  );
}

function useAccounts(refreshKey: number): AccountState {
  const [state, setState] = useState<AccountState>({
    accounts: [],
    isLoading: true,
    requiresPassword: false,
  });

  useEffect(() => {
    let isCancelled = false;

    async function fetchAccounts() {
      const loadStartedAt = performance.now();
      setState((current) => ({ ...current, isLoading: true, error: undefined, requiresPassword: false }));
      debugLog("accounts.load.start", { refreshKey, hasSessionPassword: Boolean(sessionPassword) });

      if (isCancelled) {
        debugLog("accounts.load.cancelled", { durationMs: elapsedMs(loadStartedAt) });
        return;
      }

      const listStartedAt = performance.now();
      const result = await listAccountsWithBackend();
      debugLog("accounts.list.done", {
        durationMs: elapsedMs(listStartedAt),
        success: result.success,
        requiresPassword: Boolean(result.requiresPassword),
        outputLines: countLines(result.output),
      });
      if (isCancelled) {
        debugLog("accounts.load.cancelled", { durationMs: elapsedMs(loadStartedAt) });
        return;
      }

      if (result.requiresPassword) {
        setState({ accounts: [], isLoading: false, requiresPassword: true });
        debugLog("accounts.load.password_required", { durationMs: elapsedMs(loadStartedAt) });
        return;
      }

      if (!result.success) {
        setState({
          accounts: [],
          isLoading: false,
          error: result.error || "Failed to list accounts",
          requiresPassword: false,
        });
        debugLog("accounts.load.failed", {
          durationMs: elapsedMs(loadStartedAt),
          error: result.error,
        });
        return;
      }

      const parseStartedAt = performance.now();
      const accounts = parseAccounts(result.output || "");
      debugLog("accounts.parse.done", {
        durationMs: elapsedMs(parseStartedAt),
        accountCount: accounts.length,
      });

      setState({
        accounts,
        isLoading: false,
        requiresPassword: false,
      });

      debugLog("accounts.load.done", {
        durationMs: elapsedMs(loadStartedAt),
        accountCount: accounts.length,
      });
    }

    fetchAccounts();

    return () => {
      isCancelled = true;
    };
  }, [refreshKey]);

  return state;
}

async function performCodeAction(
  account: Account,
  actionType: ActionType.Copy | ActionType.Paste,
  onRequiresPassword: () => void
) {
  const actionStartedAt = performance.now();
  debugLog("otp.action.start", {
    actionType,
    accountId: accountDebugId(account.key),
  });

  const toastStartedAt = performance.now();
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Getting OTP code",
    message: "Touch your YubiKey if prompted",
  });
  debugLog("otp.toast.done", { durationMs: elapsedMs(toastStartedAt) });

  const result = await getAccountCode(account.key);
  if (result.requiresPassword) {
    toast.style = Toast.Style.Failure;
    toast.title = "Password required";
    onRequiresPassword();
    debugLog("otp.action.password_required", {
      durationMs: elapsedMs(actionStartedAt),
      accountId: accountDebugId(account.key),
    });
    return;
  }

  if (!result.success || !result.output) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to get code";
    toast.message = result.error;
    debugLog("otp.action.failed", {
      durationMs: elapsedMs(actionStartedAt),
      accountId: accountDebugId(account.key),
      error: result.error,
    });
    return;
  }

  const code = result.output.trim();
  if (actionType === ActionType.Copy) {
    await Clipboard.copy(code, { concealed: true });
    toast.style = Toast.Style.Success;
    toast.title = "Copied OTP code";
    await showHUD("Copied OTP code");
    debugLog("otp.action.done", {
      durationMs: elapsedMs(actionStartedAt),
      actionType,
      accountId: accountDebugId(account.key),
    });
    return;
  }

  debugLog("otp.paste.invoke", { accountId: accountDebugId(account.key) });
  void closeMainWindow();
  void Clipboard.paste(code);
  debugLog("otp.paste.dispatched", { accountId: accountDebugId(account.key) });
  toast.style = Toast.Style.Success;
  toast.title = "Pasted OTP code";
  debugLog("otp.action.done", {
    durationMs: elapsedMs(actionStartedAt),
    actionType,
    accountId: accountDebugId(account.key),
  });
}

async function getAccountCode(accountKey: string): Promise<CommandResult> {
  const startedAt = performance.now();
  debugLog("otp.fetch.start", { accountId: accountDebugId(accountKey) });
  const result = await getAccountCodeWithBackend(accountKey);
  if (!result.success || !result.output) {
    debugLog("otp.fetch.done", {
      durationMs: elapsedMs(startedAt),
      success: result.success,
      requiresPassword: Boolean(result.requiresPassword),
      accountId: accountDebugId(accountKey),
      error: result.error,
    });
    return result;
  }

  debugLog("otp.fetch.done", {
    durationMs: elapsedMs(startedAt),
    success: true,
    outputLength: result.output.trim().length,
    accountId: accountDebugId(accountKey),
  });
  return { success: true, output: result.output.trim() };
}

async function testAuthentication(password: string): Promise<CommandResult> {
  return executeYkmanWithAuth(["oath", "accounts", "list"], password);
}

async function rememberPassword(password: string): Promise<CommandResult> {
  return executeYkman(["oath", "access", "remember", "-p", password]);
}

async function forgetPassword(): Promise<CommandResult> {
  const result = await executeYkman(["oath", "access", "forget"]);
  if (result.success) {
    sessionPassword = undefined;
  }

  return result;
}

async function listAccountsWithBackend(): Promise<CommandResult> {
  let ykoathError: string | undefined;

  if (shouldTryYkoath()) {
    const result = await executeYkoath(["list"]);
    if (result.success || selectedBackend() === Backend.Ykoath) {
      return result;
    }

    ykoathError = result.error;

    debugLog("backend.fallback", {
      operation: "list",
      from: Backend.Ykoath,
      to: Backend.Ykman,
      error: result.error,
    });
  }

  const ykmanResult = await executeYkmanWithAuth(["oath", "accounts", "list"], sessionPassword);
  return withCombinedBackendError(ykmanResult, ykoathError);
}

async function getAccountCodeWithBackend(accountKey: string): Promise<CommandResult> {
  let ykoathError: string | undefined;

  if (shouldTryYkoath()) {
    const result = await executeYkoath(["code", accountKey]);
    if (result.success || selectedBackend() === Backend.Ykoath) {
      return result;
    }

    ykoathError = result.error;

    debugLog("backend.fallback", {
      operation: "code",
      accountId: accountDebugId(accountKey),
      from: Backend.Ykoath,
      to: Backend.Ykman,
      error: result.error,
    });
  }

  const ykmanResult = await executeYkmanWithAuth(["oath", "accounts", "code", accountKey, "-s"], sessionPassword);
  return withCombinedBackendError(ykmanResult, ykoathError);
}

function withCombinedBackendError(result: CommandResult, ykoathError?: string): CommandResult {
  if (result.success || result.requiresPassword || !ykoathError) {
    return result;
  }

  return {
    ...result,
    error: [`ykoath failed: ${ykoathError}`, `ykman failed: ${result.error || "unknown error"}`].join("\n"),
  };
}

async function executeYkmanWithAuth(args: string[], password?: string): Promise<CommandResult> {
  debugLog("auth.execute", {
    backend: Backend.Ykman,
    command: summarizeCommand(args),
    hasSessionPassword: Boolean(password),
  });
  const finalArgs = password ? [...args, "-p", password] : args;
  return executeYkman(finalArgs);
}

async function executeYkoath(args: string[]): Promise<CommandResult> {
  const commandId = nextYkmanCommandId++;
  const startedAt = performance.now();
  return executeYkoathOneShot(commandId, startedAt, args);
}

async function executeYkoathOneShot(commandId: number, startedAt: number, args: string[]): Promise<CommandResult> {
  const finalArgs = shouldEmitExternalDebugLogs() ? ["--debug-timing", ...args] : args;
  debugLog("ykoath.start", {
    id: commandId,
    mode: "oneshot",
    args: redactArgs(finalArgs),
    executable: ykoathExecutable(),
  });

  try {
    const { stdout, stderr } = await execFileAsync(ykoathExecutable(), finalArgs);
    logYkoathTimings(commandId, stderr);
    debugLog("ykoath.success", {
      id: commandId,
      mode: "oneshot",
      durationMs: elapsedMs(startedAt),
      stdoutBytes: stdout.length,
      stdoutLines: countLines(stdout),
    });
    return { success: true, output: stdout.trim() };
  } catch (error) {
    const formattedError = formatProcessError(error, ykoathExecutable());
    debugLog("ykoath.failure", {
      id: commandId,
      mode: "oneshot",
      durationMs: elapsedMs(startedAt),
      error: formattedError,
    });
    return { success: false, error: formattedError };
  }
}

async function executeYkman(args: string[]): Promise<CommandResult> {
  const commandId = nextYkmanCommandId++;
  const startedAt = performance.now();
  debugLog("ykman.start", { id: commandId, args: redactArgs(args) });

  try {
    const { stdout } = await execFileAsync(ykmanExecutable(), args);
    debugLog("ykman.success", {
      id: commandId,
      durationMs: elapsedMs(startedAt),
      stdoutBytes: stdout.length,
      stdoutLines: countLines(stdout),
    });
    return { success: true, output: stdout.trim() };
  } catch (error) {
    if (isPasswordError(error)) {
      debugLog("ykman.password_error", {
        id: commandId,
        durationMs: elapsedMs(startedAt),
      });
      return { success: false, requiresPassword: true, error: "Password required or invalid" };
    }

    const formattedError = formatYkmanError(error);
    debugLog("ykman.failure", {
      id: commandId,
      durationMs: elapsedMs(startedAt),
      error: formattedError,
    });
    return { success: false, error: formattedError };
  }
}

function execFileAsync(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        const execError = error as ExecFileException & { stdout?: string; stderr?: string };
        execError.stdout = stdout;
        execError.stderr = stderr;
        reject(execError);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function parseAccounts(output: string): Account[] {
  return output
    .split("\n")
    .map((line) => parseAccount(line))
    .filter((account): account is Account => Boolean(account));
}

function parseAccount(line: string): Account | undefined {
  const trimmed = line.trimEnd();
  if (!trimmed) {
    return undefined;
  }

  const codeMatch = trimmed.match(/^(.*\S)\s+(\d{6,8})$/);
  const key = codeMatch ? codeMatch[1].trim() : trimmed.trim();

  const [name, ...details] = key.split(":");
  return {
    name: name || key,
    details: details.join(":"),
    key,
  };
}

function ykmanExecutable(): string {
  return preferences.ykmanPath?.trim() || "ykman";
}

function ykoathExecutable(): string {
  return preferences.ykoathPath?.trim() || "ykoath";
}

function selectedBackend(): Backend {
  switch (preferences.backend) {
    case Backend.Ykoath:
    case "ykoath-rs":
      return Backend.Ykoath;
    case Backend.Ykman:
      return Backend.Ykman;
    default:
      return Backend.Auto;
  }
}

function shouldTryYkoath(): boolean {
  const backend = selectedBackend();
  return backend === Backend.Auto || backend === Backend.Ykoath;
}

function formatYkmanError(error: unknown): string {
  return formatProcessError(error, ykmanExecutable());
}

function formatProcessError(error: unknown, executable: string): string {
  const execError = error as Partial<ExecFileException> & { stderr?: string; stdout?: string };
  const stderr = execError.stderr?.trim();
  const message = execError.message?.trim();

  if (execError.code === "ENOENT") {
    return `Could not find ${executable}. Install it or set the executable path in preferences.`;
  }

  if (stderr && isConnectionError(stderr)) {
    return "No YubiKey detected or the YubiKey is currently unavailable.";
  }

  return stderr || message || "ykman command failed";
}

function isPasswordError(error: unknown): boolean {
  const execError = error as Partial<ExecFileException> & { stderr?: string };
  const text = `${execError.stderr || ""}\n${execError.message || ""}`;
  return /password|authentication|Invalid PIN|locked/i.test(text);
}

function isConnectionError(message: string): boolean {
  return /Failed to connect to YubiKey|Failed opening device|No YubiKey detected/i.test(message);
}

function debugLog(event: string, data: Record<string, unknown> = {}) {
  const entry = {
    elapsedMs: elapsedMs(debugSessionStartedAt),
    event,
    data,
  };

  debugEntries.push(entry);

  if (debugEntries.length > maxDebugEntries) {
    debugEntries.shift();
  }

  if (!preferences.debugLogging && !environment.isDevelopment) {
    return;
  }

  const message = `[yubikey-code] ${event} ${JSON.stringify(entry)}\n`;

  console.log(message.trimEnd());
  appendSupportLog(message);
  if (environment.isDevelopment) {
    appendDevLog(message);
  }
}

function appendSupportLog(message: string) {
  try {
    mkdirSync(environment.supportPath, { recursive: true });
    appendFileSync(join(environment.supportPath, "debug.log"), message);
  } catch {
    // Best effort only. In-memory debug actions still work.
  }
}

function appendDevLog(message: string) {
  try {
    appendFileSync(join(dirname(environment.assetsPath), "dev.log"), message);
  } catch {
    // Best effort only. Console logging and in-extension debug actions still work.
  }
}

function formatDebugEvents(): string {
  if (debugEntries.length === 0) {
    return "[]";
  }

  return JSON.stringify(debugEntries, null, 2);
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function countLines(output?: string): number {
  if (!output) {
    return 0;
  }

  return output.split("\n").filter((line) => line.trim().length > 0).length;
}

function logYkoathTimings(commandId: number, stderr: string) {
  for (const line of stderr.split("\n")) {
    if (!line.startsWith("ykoath.timing ")) {
      continue;
    }

    debugLog("ykoath.internal", {
      id: commandId,
      timing: line.slice("ykoath.timing ".length),
    });
  }
}

function shouldEmitExternalDebugLogs(): boolean {
  return Boolean(preferences.debugLogging || environment.isDevelopment);
}

function accountDebugId(accountKey: string): string {
  return createHash("sha256").update(accountKey).digest("hex").slice(0, 10);
}

function formatShortcut(shortcut?: Keyboard.Shortcut | Keyboard.Shortcut.Common): string | undefined {
  if (!shortcut) {
    return undefined;
  }

  if (typeof shortcut === "string") {
    return shortcut;
  }

  return [...shortcut.modifiers, shortcut.key].join("+");
}

function summarizeCommand(args: string[]): string {
  return args.slice(0, 3).join(" ");
}

function redactArgs(args: string[]): string[] {
  const redacted = [...args];

  for (let index = 0; index < redacted.length; index += 1) {
    if (redacted[index - 1] === "-p" || redacted[index - 1] === "--password") {
      redacted[index] = "<password>";
    }
  }

  if (redacted[0] === "oath" && redacted[1] === "accounts" && redacted[2] === "code" && redacted[3]) {
    redacted[3] = "<account>";
  }

  if (redacted[0] === "code" && redacted[1]) {
    redacted[1] = "<account>";
  }

  if (redacted[0] === "--debug-timing" && redacted[1] === "code" && redacted[2]) {
    redacted[2] = "<account>";
  }

  return redacted;
}
