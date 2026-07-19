import { useCallback, useEffect, useRef, useState } from "react";
import {
  Action,
  ActionPanel,
  Cache,
  Color,
  Form,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { pasteAndForget } from "./lib/clipboard";
import { localizeError, t } from "./lib/i18n";
import { disposeOath, oath } from "./lib/oath-session";
import { countdownRing, urgencyColor } from "./lib/progress-icon";
import {
  type TouchHandle,
  clearCooldown,
  cooldownRemaining,
  requestTouchCode,
  waitForCard,
} from "./lib/touch";
import { type Code, type Cred, type CodesResult, OathError } from "./lib/ykoath";
import { PcscError } from "./lib/pcsc";

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

const cache = new Cache({ namespace: "otp" });
const CREDS_KEY = "creds";

const HIDDEN = "••• •••";

/** Agrupa para leitura: 720658 vira "720 658". O que é COLADO nunca leva espaço. */
function formatCode(value: string): string {
  if (value.length === 6) return `${value.slice(0, 3)} ${value.slice(3)}`;
  if (value.length === 8) return `${value.slice(0, 4)} ${value.slice(4)}`;
  return value;
}

/** Uma conta com período diferente de 30 vem com o período no id ("60/GitHub:x"). */
function displayName(cred: Cred): { title: string; subtitle: string } {
  const issuer = cred.issuer?.replace(/^\d+\//, "") ?? null;
  const label = issuer ? `${issuer} · ${cred.name}` : cred.name;
  return { title: label, subtitle: label };
}

function secondsLeft(code: Code, now: number): number {
  return Math.max(0, Math.ceil(code.validTo - now));
}

type State = {
  creds: Cred[];
  codes: Record<string, Code | null>;
  loading: boolean;
  error: Error | null;
};

/** Extrai o `code` de um OathError/PcscError, se houver. */
function errCode(err: Error | null): string | undefined {
  if (err instanceof OathError || err instanceof PcscError) return err.code;
  return undefined;
}

export default function OtpCodes() {
  const { push } = useNavigation();

  const [state, setState] = useState<State>(() => {
    // A lista de contas vem do cache para a tela nunca abrir vazia. Os códigos chegam
    // logo atrás; até lá cada conta mostra ••• •••.
    const cached = cache.get(CREDS_KEY);
    const creds: Cred[] = cached ? JSON.parse(cached) : [];
    return { creds, codes: {}, loading: true, error: null };
  });

  const [now, setNow] = useState(() => Date.now() / 1000);
  const [touching, setTouching] = useState<string | null>(null);

  // Enquanto um toque está pendente, o cartão está preso pelo processo do toque.
  // Qualquer refresh nosso bateria em SCARD_E_SHARING_VIOLATION.
  const touchingRef = useRef(false);
  touchingRef.current = touching !== null;

  // Guardamos o handle para poder matar o processo do toque no Esc (desmonta o comando)
  // ou numa ação explícita de cancelar. Sem isso, sobra um Python órfão segurando o cartão.
  const handleRef = useRef<TouchHandle | null>(null);

  const load = useCallback(async () => {
    if (touchingRef.current) return;

    // Durante o cooldown o cartão não responde e a chamada não falharia: ficaria pendurada,
    // travando a tela com o spinner. Melhor não emitir nada e deixar o usuário ver o cache.
    if (cooldownRemaining() > 0) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    try {
      const result = await oath().codes();
      // Só grava no cache se a lista de contas mudou: cada set é um round-trip de IPC.
      const serialized = JSON.stringify(result.creds);
      if (serialized !== cache.get(CREDS_KEY)) cache.set(CREDS_KEY, serialized);
      setState({ creds: result.creds, codes: result.codes, loading: false, error: null });
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err : new Error(String(err)) }));
    }
  }, []);

  // Quanto falta, no pior caso, até o cartão voltar a responder. É só uma estimativa para o
  // contador na tela: quem realmente decide é o `waitForCard` abaixo, que resolve no instante
  // em que a chave responde (por toque ou por timeout dela).
  const busyFor = Math.ceil(cooldownRemaining() / 1000);
  const waitingRef = useRef<TouchHandle | null>(null);

  // O relógio da tela. Só corre quando há um contador para mover, e alinhado à borda do segundo.
  // O Vicinae re-serializa a árvore inteira a cada tick, então um tick que não muda nada visível
  // é puro desperdício, e um setInterval que deriva pode gastar dois no mesmo segundo.
  const hasLiveCode = Object.values(state.codes).some(Boolean);
  const tickActive = hasLiveCode && !state.loading;
  useEffect(() => {
    if (!tickActive) return;
    let timer: NodeJS.Timeout;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(Date.now() / 1000);
        schedule();
      }, 1000 - (Date.now() % 1000));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [tickActive]);

  /**
   * Fica pendurado no cartão até ele se soltar, e então atualiza a tela.
   *
   * Se o usuário tocar na chave, isto resolve na hora: o toque conclui a operação que ficou
   * pendente e libera o cartão, mesmo sem ninguém lendo o código. É a única saída rápida.
   */
  const waitForFreeCard = useCallback(() => {
    if (waitingRef.current) return;

    const handle = waitForCard();
    waitingRef.current = handle;

    handle.promise
      .then((result) => {
        const codes = result as unknown as CodesResult;
        const serialized = JSON.stringify(codes.creds);
        if (serialized !== cache.get(CREDS_KEY)) cache.set(CREDS_KEY, serialized);
        setState({ creds: codes.creds, codes: codes.codes, loading: false, error: null });
      })
      .catch(() => {
        // Desistiu ou a chave sumiu: o load normal (ou o usuário) resolve daqui.
      })
      .finally(() => {
        waitingRef.current = null;
        clearCooldown();
        setNow(Date.now() / 1000);
      });
  }, []);

  useEffect(() => {
    // Reabrir o comando dentro da janela de 15s cai aqui: o cartão ainda está preso do
    // cancelamento anterior, então esperamos ele se soltar em vez de mandar um comando que
    // ficaria pendurado.
    if (cooldownRemaining() > 0) waitForFreeCard();
    else load();

    // Esc desmonta o comando. Sem este cleanup, um toque pendente deixaria um processo
    // Python órfão, e a espera pelo cartão continuaria rodando à toa.
    return () => {
      handleRef.current?.cancel();
      handleRef.current = null;
      waitingRef.current?.cancel();
      waitingRef.current = null;
      disposeOath();
    };
  }, [load, waitForFreeCard]);

  // Recarrega quando a janela de 30s vira. O gatilho é o `validTo` que o cartão nos deu,
  // não `Date.now() % 30`: assim um relógio adiantado no host não faz o código expirar cedo.
  const nextExpiry = Object.values(state.codes).reduce<number | null>((min, code) => {
    if (!code) return min;
    return min === null || code.validTo < min ? code.validTo : min;
  }, null);

  useEffect(() => {
    if (nextExpiry === null || state.loading || touching || busyFor > 0) return;
    if (now >= nextExpiry) load();
  }, [now, nextExpiry, state.loading, touching, busyFor, load]);

  const onUnlocked = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load();
  }, [load]);

  const deliver = useCallback(async (value: string, label: string) => {
    try {
      await pasteAndForget(value);
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: t("otp.paste.failed"),
        message: `${label}: ${localizeError(err)}`,
      });
    }
  }, []);

  /** Contas de toque (e HOTP) só entregam código sob pedido explícito e com o dedo na chave. */
  const withTouch = useCallback(
    async (cred: Cred) => {
      if (touchingRef.current) return;

      // Pedir um toque com o cartão ainda preso do cancelamento anterior só resultaria numa
      // espera silenciosa de até 15s antes de a chave sequer piscar.
      const busy = Math.ceil(cooldownRemaining() / 1000);
      if (busy > 0) {
        await showToast({
          style: Toast.Style.Failure,
          title: t("busy.title"),
          message: t("busy.message", { s: busy }),
        });
        return;
      }

      setTouching(cred.id);
      const { title } = displayName(cred);

      const handle = requestTouchCode(cred.id, cred.period);
      handleRef.current = handle;

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: t("touch.prompt"),
        message: title,
      });

      try {
        const code = await handle.promise;
        await toast.hide();
        setTouching(null);
        handleRef.current = null;
        await deliver(code.value, title);
      } catch (err) {
        setTouching(null);
        handleRef.current = null;
        const code = errCode(err instanceof Error ? err : null);
        // Tanto o cancelamento quanto o timeout deixam o cartão preso esperando o dedo, então
        // ficamos pendurados nele; se o usuário tocar, voltamos.
        if (code === "touch_timeout" || code === "cancelled") waitForFreeCard();

        if (code === "cancelled") {
          await toast.hide();
          return;
        }

        toast.style = Toast.Style.Failure;
        toast.title = code === "touch_timeout" ? t("touch.notReceived") : localizeError(err);
        toast.message = localizeError(err);
      }
    },
    [deliver, waitForFreeCard],
  );

  const cancelTouch = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setTouching(null);
  }, []);

  if (errCode(state.error) === "locked") {
    return <LockedView onUnlocked={onUnlocked} />;
  }

  if (isDeviceProblem(state.error) && state.creds.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title={errCode(state.error) === "busy" ? t("device.busy") : t("device.none")}
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

  const touchCreds = state.creds.filter((c) => c.touch || c.type === "HOTP");
  const autoCreds = state.creds.filter((c) => !c.touch && c.type === "TOTP");

  return (
    <List
      isLoading={state.loading}
      searchBarPlaceholder={t("otp.search")}
      navigationTitle={t("otp.nav")}
    >
      {busyFor > 0 && (
        <List.Section title={t("busy.section")}>
          <List.Item
            id="__busy__"
            title={t("busy.item.title")}
            subtitle={t("busy.item.subtitle", { s: busyFor })}
            icon={Icon.Fingerprint}
            accessories={[{ tag: { value: `${busyFor}s`, color: Color.Orange } }]}
          />
        </List.Section>
      )}

      {autoCreds.length > 0 && (
        <List.Section title={t("otp.section.codes")}>
          {autoCreds.map((cred) => (
            <CodeItem
              key={cred.id}
              cred={cred}
              code={state.codes[cred.id] ?? null}
              now={now}
              onDeliver={deliver}
            />
          ))}
        </List.Section>
      )}

      {touchCreds.length > 0 && (
        <List.Section title={t("otp.section.touch")}>
          {touchCreds.map((cred) => (
            <TouchItem
              key={cred.id}
              cred={cred}
              pending={touching === cred.id}
              onTouch={() => withTouch(cred)}
              onCancel={cancelTouch}
            />
          ))}
        </List.Section>
      )}

      <List.EmptyView
        icon={Icon.Key}
        title={state.loading ? t("otp.reading") : t("otp.noAccounts")}
        description={state.loading ? undefined : t("otp.noAccounts.hint")}
      />
    </List>
  );
}

function CodeItem({
  cred,
  code,
  now,
  onDeliver,
}: {
  cred: Cred;
  code: Code | null;
  now: number;
  onDeliver: (value: string, label: string) => Promise<void>;
}) {
  const { title, subtitle } = displayName(cred);
  const left = code ? secondsLeft(code, now) : 0;

  const accessories: List.Item.Accessory[] = code
    ? [
        { tag: { value: `${left}s`, color: urgencyColor(left) }, tooltip: t("otp.countdown.tooltip") },
        { icon: countdownRing(left, cred.period) },
      ]
    : [{ tag: { value: "…", color: Color.SecondaryText } }];

  return (
    <List.Item
      // O id precisa ser estável: sem ele, o re-render de cada segundo pode mover a
      // seleção e o Enter colaria o código da conta errada.
      id={cred.id}
      title={code ? formatCode(code.value) : HIDDEN}
      subtitle={subtitle}
      // Na variante B o título é o código, então a busca por nome depende disto.
      keywords={[cred.issuer ?? "", cred.name, cred.id].filter(Boolean)}
      icon={Icon.Key}
      accessories={accessories}
      actions={
        code ? (
          <ActionPanel>
            <Action
              title={t("otp.action.paste")}
              icon={Icon.CopyClipboard}
              onAction={() => onDeliver(code.value, title)}
            />
            <Action.CopyToClipboard
              title={t("otp.action.copy")}
              icon={Icon.CopyClipboard}
              content={code.value}
              concealed
              shortcut={{ key: "c", modifiers: ["cmd"] }}
            />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}

function TouchItem({
  cred,
  pending,
  onTouch,
  onCancel,
}: {
  cred: Cred;
  pending: boolean;
  onTouch: () => void;
  onCancel: () => void;
}) {
  const { subtitle } = displayName(cred);
  const isHotp = cred.type === "HOTP";

  return (
    <List.Item
      id={cred.id}
      title={HIDDEN}
      subtitle={subtitle}
      keywords={[cred.issuer ?? "", cred.name, cred.id].filter(Boolean)}
      icon={Icon.Fingerprint}
      accessories={[
        {
          tag: {
            value: pending ? t("touch.tag.waiting") : isHotp ? "HOTP" : t("touch.tag.touch"),
            color: pending ? Color.Yellow : Color.Orange,
          },
          tooltip: isHotp ? t("touch.tooltip.hotp") : t("touch.tooltip.touch"),
        },
      ]}
      actions={
        <ActionPanel>
          {pending ? (
            <Action title={t("touch.action.cancel")} icon={Icon.Stop} onAction={onCancel} />
          ) : (
            <Action title={t("touch.action.request")} icon={Icon.Fingerprint} onAction={onTouch} />
          )}
        </ActionPanel>
      }
    />
  );
}

/** O OATH está protegido por senha e o ykman não a tem guardada nesta máquina. */
function LockedView({ onUnlocked }: { onUnlocked: () => void }) {
  const [loading, setLoading] = useState(false);
  const { pop } = useNavigation();

  const submit = async (values: Form.Values) => {
    const password = String(values.password ?? "");
    if (!password) return;

    setLoading(true);
    try {
      await oath().unlock(password, Boolean(values.remember));
      onUnlocked();
      pop();
    } catch (err) {
      setLoading(false);
      await showToast({ style: Toast.Style.Failure, title: t("unlock.failed"), message: localizeError(err) });
    }
  };

  return (
    <Form
      isLoading={loading}
      navigationTitle={t("unlock.nav")}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={t("unlock.action")} icon={Icon.LockUnlocked} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description title={t("unlock.needed.title")} text={t("unlock.needed.text")} />
      <Form.PasswordField
        id="password"
        title={t("unlock.field.password")}
        placeholder={t("unlock.field.passwordPlaceholder")}
      />
      <Form.Checkbox
        id="remember"
        label={t("unlock.remember.label")}
        title={t("unlock.remember.title")}
        defaultValue={true}
        info={t("unlock.remember.info")}
      />
    </Form>
  );
}
