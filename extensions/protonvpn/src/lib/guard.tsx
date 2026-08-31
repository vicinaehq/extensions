import { List, Icon, Color, ActionPanel, Action, useNavigation } from "@vicinae/api";
import { checkInstalled, checkSignedIn } from "@/lib/protonvpn";
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";

export type GuardState = "loading" | "missing" | "unauthed" | "ready";

export function useProtonGuard() {
  const [state, setState] = useState<GuardState>("loading");
  const mounted = useRef(true);

  const check = useCallback(async () => {
    if (!mounted.current) return;
    setState("loading");
    if (!(await checkInstalled())) {
      if (mounted.current) setState("missing");
      return;
    }
    if (!(await checkSignedIn())) {
      if (mounted.current) setState("unauthed");
      return;
    }
    if (mounted.current) setState("ready");
  }, []);

  useEffect(() => {
    mounted.current = true;
    check();
    return () => { mounted.current = false; };
  }, [check]);

  return { state, refresh: check };
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

export function ProtonGuard({
  state,
  onRefresh,
  children,
}: {
  state: GuardState;
  onRefresh: () => void;
  children: ReactNode;
}) {
  if (state === "loading") return <LoadingScreen />;
  if (state === "missing") return <MissingScreen />;
  if (state === "unauthed") return <UnauthedScreen onRefresh={onRefresh} />;
  return <>{children}</>;
}
