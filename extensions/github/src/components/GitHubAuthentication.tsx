import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  openExtensionPreferences,
  runInTerminal,
} from "@vicinae/api";
import { ReactNode, useCallback, useEffect, useState } from "react";
import {
  authenticateWithGitHub,
  GitHubAuthentication as GitHubAuthenticationState,
} from "../api/githubClient";

type AuthenticationState =
  | { status: "loading" }
  | GitHubAuthenticationState;

export const GitHubAuthentication = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [authentication, setAuthentication] = useState<AuthenticationState>({
    status: "loading",
  });

  const authenticate = useCallback(async (force = false) => {
    setAuthentication({ status: "loading" });
    setAuthentication(await authenticateWithGitHub(force));
  }, []);

  useEffect(() => {
    authenticate();
  }, [authenticate]);

  if (authentication.status === "loading") {
    return <List isLoading />;
  }

  if (authentication.status === "authenticated") {
    return children;
  }

  const markdown =
    authentication.githubCliStatus === "not-authenticated"
      ? "# GitHub Authentication Required\n\nGitHub CLI is installed but not authenticated. Sign in with GitHub CLI, or configure a Personal Access Token in the extension preferences."
      : authentication.githubCliStatus === "not-installed"
        ? "# GitHub Authentication Required\n\nInstall and sign in with GitHub CLI, or configure a Personal Access Token in the extension preferences."
        : "# GitHub Authentication Failed\n\nGitHub CLI could not provide an authentication token. Try again, or configure a Personal Access Token in the extension preferences.";

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          {authentication.githubCliStatus === "not-authenticated" ? (
            <Action
              title="Sign In with GitHub CLI"
              icon={Icon.Terminal}
              onAction={() =>
                runInTerminal(
                  ["gh", "auth", "login", "--hostname", "github.com"],
                  { hold: true },
                )
              }
            />
          ) : authentication.githubCliStatus === "not-installed" ? (
            <Action.OpenInBrowser
              title="Install GitHub CLI"
              icon={Icon.Download}
              url="https://cli.github.com/"
            />
          ) : null}
          <Action
            title="Try Again"
            icon={Icon.ArrowClockwise}
            onAction={() => authenticate(true)}
          />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Cog}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    />
  );
};
