import { SessionProvider, useSession } from "./context/session-provider";
import { VaultProvider } from "./context/vault-provider";
import { ApiKeyLoginForm } from "./components/api-key-login-form";
import { UnlockForm } from "./components/unlock-form";
import { ItemList } from "./components/item-list";
import { Detail, List } from "@vicinae/api";

function Inner() {
  const { state, invalidateSession } = useSession();
  if (state.kind === "loading") return <List isLoading />;
  if (state.kind === "needs-cli")
    return <Detail markdown={"# Bitwarden CLI not found\n\nInstall the `bw` CLI and configure its path in extension preferences."} />;
  if (state.kind === "needs-login") return <ApiKeyLoginForm />;
  if (state.kind === "needs-unlock") return <UnlockForm />;
  return (
    <VaultProvider vault={state.vault} onSessionInvalid={() => void invalidateSession()}>
      <ItemList />
    </VaultProvider>
  );
}

export default function Search() {
  return (
    <SessionProvider>
      <Inner />
    </SessionProvider>
  );
}
