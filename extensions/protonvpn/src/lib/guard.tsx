import { List, Icon, Color, ActionPanel, Action, useNavigation } from "@vicinae/api";
import { checkInstalled, checkSignedIn } from "@/lib/protonvpn";
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";

export type GuardState = "loading" | "missing" | "unauthed" | "error" | "ready";

export function useProtonGuard() {
  const [state, setState] = useState<GuardState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mounted = useRef(true);

  const check = useCallback(async () => {
    if (!mounted.current) return;
    setState("loading");
    setErrorMsg(null);
    if (!(await checkInstalled())) {
      if (mounted.current) setState("missing");
      return;
    }
    const result = await checkSignedIn();
    if (!mounted.current) return;
    if (!result.signedIn) {
      if (result.error) {
        setState("error");
        setErrorMsg(result.error);
      } else {
        setState("unauthed");
      }
      return;
    }
    setState("ready");
  }, []);

  useEffect(() => {
    mounted.current = true;
    check();
    return () => { mounted.current = false; };
  }, [check]);

  return { state, errorMsg, refresh: check };
}

function LoadingScreen() {
  return <List isLoading />;
}

function MissingScreen() {
  return (
    <List>
      <List.Section title="ProtonVPN CLI Not Found">
        <List.Item
          title="protonvpn is not installed"
          subtitle="Install it from protonvpn.com/support/linux-cli"
          icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open Install Guide"
                url="https://protonvpn.com/support/linux-cli"
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

function UnauthedScreen({ onRefresh }: { onRefresh: () => void }) {
  return (
    <List>
      <List.Section title="Not Signed In">
        <List.Item
          title="Sign in to ProtonVPN"
          subtitle="Run this command in your terminal, then come back"
          icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Sign-In Command"
                content="protonvpn signin"
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                onAction={onRefresh}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

function ErrorScreen({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  return (
    <List>
      <List.Section title="Error">
        <List.Item
          title="Could not check ProtonVPN status"
          subtitle={message}
          icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={onRefresh} shortcut={{ modifiers: ["cmd"], key: "r" }} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

export function ProtonGuard({
  state,
  errorMsg,
  onRefresh,
  children,
}: {
  state: GuardState;
  errorMsg?: string | null;
  onRefresh: () => void;
  children: ReactNode;
}) {
  if (state === "loading") return <LoadingScreen />;
  if (state === "missing") return <MissingScreen />;
  if (state === "error") return <ErrorScreen message={errorMsg ?? "Unknown error"} onRefresh={onRefresh} />;
  if (state === "unauthed") return <UnauthedScreen onRefresh={onRefresh} />;
  return <>{children}</>;
}
