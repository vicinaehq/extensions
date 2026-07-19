import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { type FidoCred, type FidoInfo, fido } from "./lib/fido-session";
import { lang, localizeError, t } from "./lib/i18n";
import { PcscError } from "./lib/pcsc";
import { type PivInfo, type SlotInfo, piv } from "./lib/piv-session";

function fmtDate(epoch?: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleDateString(lang() === "pt" ? "pt-BR" : "en-US");
}

/** Um problema de dispositivo merece EmptyView, não um erro cru. */
function isDeviceProblem(err: unknown): boolean {
  return (
    err instanceof PcscError &&
    (err.code === "no_daemon" ||
      err.code === "no_reader" ||
      err.code === "no_card" ||
      err.code === "not_authorized" ||
      err.code === "card_removed" ||
      err.code === "busy")
  );
}

type State = {
  piv: PivInfo | null;
  fido: FidoInfo | null;
  /** null = ainda checando; false = Python indisponível, passkeys ficam de fora. */
  fidoSupported: boolean | null;
  loading: boolean;
  error: Error | null;
};

export default function SecurityKeys() {
  const { push } = useNavigation();

  const [state, setState] = useState<State>({
    piv: null,
    fido: null,
    fidoSupported: null,
    loading: true,
    error: null,
  });

  // O PIN vive só aqui, na memória do comando. Nunca em Cache, LocalStorage nem argv.
  const [fidoPin, setFidoPin] = useState<string | null>(null);
  const [fidoCreds, setFidoCreds] = useState<FidoCred[] | null>(null);

  const load = useCallback(async () => {
    // Tudo nativo agora: PIV via CCID, FIDO2 via HID. Sem Python.
    try {
      const pivInfo = await piv().info();

      let fidoInfo: FidoInfo | null = null;
      const fidoSupported = fido().available();
      if (fidoSupported) {
        fidoInfo = await fido().info().catch(() => null);
      }

      setState({
        piv: pivInfo,
        fido: fidoInfo,
        fidoSupported: fidoSupported && fidoInfo !== null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err : new Error(String(err)) }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const listPasskeys = useCallback(
    async (pin: string) => {
      try {
        const creds = await fido().listCredentials(pin);
        setFidoPin(pin);
        setFidoCreds(creds);
        await showToast({
          style: Toast.Style.Success,
          title: creds.length === 1 ? t("keys.fido.count.one") : t("keys.fido.count.many", { n: creds.length }),
        });
      } catch (err) {
        await showToast({ style: Toast.Style.Failure, title: t("keys.fido.listFailed"), message: localizeError(err) });
        load(); // um PIN errado consome tentativa; recarrega para mostrar quantas sobraram
        throw err;
      }
    },
    [load],
  );

  const askPin = useCallback(() => {
    push(<PinForm retries={state.fido?.pinRetries ?? null} onSubmit={listPasskeys} />);
  }, [push, listPasskeys, state.fido?.pinRetries]);

  const deletePasskey = useCallback(
    async (cred: FidoCred) => {
      if (!fidoPin) return;
      try {
        await fido().deleteCredential(fidoPin, cred.credentialId);
        setFidoCreds((prev) => prev?.filter((c) => c.credentialId !== cred.credentialId) ?? null);
        await showToast({ style: Toast.Style.Success, title: t("keys.fido.deleted"), message: cred.rpId ?? "" });
        load();
      } catch (err) {
        await showToast({ style: Toast.Style.Failure, title: t("keys.fido.deleteFailed"), message: localizeError(err) });
      }
    },
    [fidoPin, load],
  );

  /** Exporta o certificado de um slot PIV. Nativo, sem PIN (o certificado é público). */
  const exportCert = useCallback(async (slot: SlotInfo) => {
    try {
      const pem = await piv().exportCertificate(objectIdForSlot(slot.slot));
      const path = join(homedir(), `yubikey-piv-${slot.slot}.pem`);
      writeFileSync(path, pem, { mode: 0o600 });
      await showToast({ style: Toast.Style.Success, title: t("keys.piv.exported"), message: path });
    } catch (err) {
      await showToast({ style: Toast.Style.Failure, title: t("keys.piv.exportFailed"), message: localizeError(err) });
    }
  }, []);

  if (isDeviceProblem(state.error)) {
    const busy = state.error instanceof PcscError && state.error.code === "busy";
    return (
      <List>
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title={busy ? t("device.busy") : t("device.none")}
          description={state.error ? localizeError(state.error) : undefined}
          actions={
            <ActionPanel>
              <Action title={t("action.retry")} icon={Icon.ArrowClockwise} onAction={load} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const refresh = (
    <Action title={t("action.reload")} icon={Icon.ArrowClockwise} shortcut={{ key: "r", modifiers: ["cmd"] }} onAction={load} />
  );

  return (
    <List
      isLoading={state.loading}
      searchBarPlaceholder={t("keys.search")}
      navigationTitle={t("keys.nav")}
      isShowingDetail
    >
      <List.Section
        title={t("keys.fido.section")}
        subtitle={state.fido?.remainingCreds != null ? t("keys.fido.slotsFree", { n: state.fido.remainingCreds }) : undefined}
      >
        {state.fidoSupported === false ? (
          <List.Item
            title={t("keys.fido.unavailable")}
            subtitle={t("keys.fido.unavailable.subtitle")}
            icon={Icon.LockDisabled}
            detail={<List.Item.Detail markdown={t("keys.fido.unavailable.detail")} />}
            actions={<ActionPanel>{refresh}</ActionPanel>}
          />
        ) : fidoCreds === null ? (
          <List.Item
            title={t("keys.fido.view")}
            subtitle={t("keys.fido.view.subtitle")}
            icon={Icon.Lock}
            accessories={[
              {
                tag: {
                  value: state.fido?.pinSet ? t("keys.fido.pinSet") : t("keys.fido.pinUnset"),
                  color: state.fido?.pinSet ? Color.Green : Color.Orange,
                },
              },
            ]}
            detail={<List.Item.Detail markdown={t("keys.fido.view.detail")} />}
            actions={
              <ActionPanel>
                <Action title={t("keys.fido.enterPin")} icon={Icon.Key} onAction={askPin} />
                {refresh}
              </ActionPanel>
            }
          />
        ) : fidoCreds.length === 0 ? (
          <List.Item
            title={t("keys.fido.none")}
            subtitle={t("keys.fido.none.subtitle")}
            icon={Icon.Circle}
            detail={<List.Item.Detail markdown={t("keys.fido.none.detail")} />}
            actions={<ActionPanel>{refresh}</ActionPanel>}
          />
        ) : (
          fidoCreds.map((cred) => (
            <List.Item
              key={cred.credentialId}
              id={cred.credentialId}
              title={cred.rpId ?? t("keys.fido.unknownRp")}
              subtitle={cred.userName ?? cred.displayName ?? ""}
              icon={Icon.Fingerprint}
              keywords={[cred.rpName ?? "", cred.userName ?? "", cred.displayName ?? ""].filter(Boolean)}
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title={t("keys.fido.meta.site")} text={cred.rpId ?? "—"} />
                      <List.Item.Detail.Metadata.Label title={t("keys.fido.meta.user")} text={cred.userName ?? "—"} />
                      <List.Item.Detail.Metadata.Label title={t("keys.fido.meta.displayName")} text={cred.displayName ?? "—"} />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label title={t("keys.fido.meta.credId")} text={`${cred.credentialId.slice(0, 32)}…`} />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard title={t("keys.fido.copyId")} icon={Icon.CopyClipboard} content={cred.credentialId} />
                  <Action
                    title={t("keys.fido.delete")}
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ key: "delete", modifiers: ["cmd"] }}
                    onAction={() =>
                      push(
                        <ConfirmDelete
                          rpId={cred.rpId ?? cred.credentialId.slice(0, 12)}
                          onConfirm={() => deletePasskey(cred)}
                        />,
                      )
                    }
                  />
                  {refresh}
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>

      <List.Section
        title={t("keys.piv.section")}
        subtitle={
          state.piv?.pinRetries != null
            ? t("keys.piv.pin", { left: state.piv.pinRetries, total: state.piv.pinTotal ?? 3 })
            : undefined
        }
      >
        {(state.piv?.slots ?? []).map((slot) => (
          <List.Item
            key={slot.slot}
            id={slot.slot}
            title={slot.label}
            subtitle={t("keys.piv.slot", { slot: slot.slot })}
            icon={slot.hasCert ? Icon.BlankDocument : Icon.Circle}
            keywords={[slot.slot, slot.slotName, slot.cert?.subject ?? ""].filter(Boolean)}
            accessories={[
              {
                tag: slot.hasCert
                  ? { value: t("keys.piv.tag.hasCert"), color: Color.Green }
                  : { value: t("keys.piv.tag.empty"), color: Color.SecondaryText },
              },
            ]}
            detail={
              <List.Item.Detail
                metadata={
                  slot.hasCert && slot.cert ? (
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title={t("keys.piv.meta.subject")} text={slot.cert.subject} />
                      <List.Item.Detail.Metadata.Label title={t("keys.piv.meta.issuer")} text={slot.cert.issuer} />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label title={t("keys.piv.meta.from")} text={fmtDate(slot.cert.notBefore)} />
                      <List.Item.Detail.Metadata.Label title={t("keys.piv.meta.until")} text={fmtDate(slot.cert.notAfter)} />
                      <List.Item.Detail.Metadata.Label title={t("keys.piv.meta.serial")} text={slot.cert.serial} />
                    </List.Item.Detail.Metadata>
                  ) : undefined
                }
                markdown={slot.hasCert ? undefined : t("keys.piv.empty.detail", { slot: slot.slot })}
              />
            }
            actions={
              <ActionPanel>
                {slot.hasCert && (
                  <Action title={t("keys.piv.export")} icon={Icon.Download} onAction={() => exportCert(slot)} />
                )}
                {refresh}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      {state.fido && (
        <List.Section title={t("keys.state.section")}>
          <List.Item
            id="fido-state"
            title={t("keys.state.fidoPin")}
            subtitle={state.fido.pinSet ? t("keys.state.set") : t("keys.state.unset")}
            icon={Icon.Lock}
            accessories={[
              {
                tag:
                  state.fido.pinRetries != null
                    ? { value: t("keys.state.attempts", { n: state.fido.pinRetries }), color: state.fido.pinRetries > 3 ? Color.Green : Color.Red }
                    : { value: "—", color: Color.SecondaryText },
              },
            ]}
            detail={
              <List.Item.Detail
                markdown={t("keys.state.detail", {
                  pin: state.fido.pinSet ? t("keys.state.set") : t("keys.state.unset"),
                  retries: state.fido.pinRetries ?? "—",
                  min: state.fido.minPinLength ?? "—",
                  slots: state.fido.remainingCreds ?? "—",
                  aaguid: state.fido.aaguid ?? "—",
                })}
              />
            }
            actions={<ActionPanel>{refresh}</ActionPanel>}
          />
        </List.Section>
      )}
    </List>
  );
}

/** Mapeia o slot ("9a") para o id do objeto que guarda o certificado. */
function objectIdForSlot(slot: string): number {
  switch (slot) {
    case "9a":
      return 0x5fc105;
    case "9c":
      return 0x5fc10a;
    case "9d":
      return 0x5fc10b;
    case "9e":
      return 0x5fc101;
    default:
      throw new Error(`slot desconhecido: ${slot}`);
  }
}

function PinForm({ retries, onSubmit }: { retries: number | null; onSubmit: (pin: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const { pop } = useNavigation();

  const submit = async (values: Form.Values) => {
    const pin = String(values.pin ?? "");
    if (!pin) return;

    setLoading(true);
    try {
      await onSubmit(pin);
      pop();
    } catch {
      setLoading(false);
    }
  };

  return (
    <Form
      isLoading={loading}
      navigationTitle={t("pin.nav")}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={t("pin.confirm")} icon={Icon.LockUnlocked} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description title={t("pin.nav")} text={t("pin.description")} />
      {retries != null && <Form.Description title={t("pin.attemptsLeft")} text={String(retries)} />}
      <Form.PasswordField id="pin" title={t("pin.field")} placeholder={t("pin.field")} />
    </Form>
  );
}

/**
 * Apagar uma passkey pode significar perder o acesso a uma conta para sempre. Um Enter num
 * alerta é fácil demais de dar sem ler, então exigimos digitar o nome do site.
 */
function ConfirmDelete({ rpId, onConfirm }: { rpId: string; onConfirm: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const { pop } = useNavigation();

  const submit = async (values: Form.Values) => {
    if (String(values.confirm ?? "").trim() !== rpId) {
      await showToast({ style: Toast.Style.Failure, title: t("confirm.mismatch.title"), message: t("confirm.mismatch.message", { rpId }) });
      return;
    }
    setLoading(true);
    await onConfirm();
    pop();
  };

  return (
    <Form
      isLoading={loading}
      navigationTitle={t("confirm.nav")}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={t("confirm.action")} icon={Icon.Trash} style={Action.Style.Destructive} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description title={t("confirm.warn.title")} text={t("confirm.warn.text", { rpId })} />
      <Form.TextField id="confirm" title={t("confirm.field")} placeholder={rpId} info={t("confirm.field.info")} />
    </Form>
  );
}
