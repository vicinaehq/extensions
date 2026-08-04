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
  showHUD,
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

/** A device problem deserves an EmptyView, not a raw error. */
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

/** Grouped for reading: 720658 becomes "720 658". What gets PASTED never has a space. */
function formatCode(value: string): string {
  if (value.length === 6) return `${value.slice(0, 3)} ${value.slice(3)}`;
  if (value.length === 8) return `${value.slice(0, 4)} ${value.slice(4)}`;
  return value;
}

/** An account with a period other than 30 carries it in the id ("60/GitHub:x"). */
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

/** Pulls the `code` out of an OathError/PcscError, if there is one. */
function errCode(err: Error | null): string | undefined {
  if (err instanceof OathError || err instanceof PcscError) return err.code;
  return undefined;
}

export default function OtpCodes() {
  const { push } = useNavigation();

  const [state, setState] = useState<State>(() => {
    // The account list comes from the cache so the screen never opens empty. The codes
    // arrive right after; until then every account shows ••• •••.
    const cached = cache.get(CREDS_KEY);
    const creds: Cred[] = cached ? JSON.parse(cached) : [];
    return { creds, codes: {}, loading: true, error: null };
  });

  const [now, setNow] = useState(() => Date.now() / 1000);
  const [touching, setTouching] = useState<string | null>(null);

  // While a touch is pending, the card is held by the touch connection. Any refresh of
  // ours would hit SCARD_E_SHARING_VIOLATION.
  const touchingRef = useRef(false);
  touchingRef.current = touching !== null;

  // We keep the handle so Esc (which unmounts the command) or an explicit cancel can close
  // the touch connection. Without it, an orphan connection would keep holding the card.
  const handleRef = useRef<TouchHandle | null>(null);

  const load = useCallback(async () => {
    if (touchingRef.current) return;

    // During the cooldown the card does not answer, and the call would not fail: it would
    // hang, freezing the screen on the spinner. Better to send nothing and show the cache.
    if (cooldownRemaining() > 0) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    try {
      const result = await oath().codes();
      // Only write to the cache when the account list changed: each set is an IPC round-trip.
      const serialized = JSON.stringify(result.creds);
      if (serialized !== cache.get(CREDS_KEY)) cache.set(CREDS_KEY, serialized);
      setState({ creds: result.creds, codes: result.codes, loading: false, error: null });
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err : new Error(String(err)) }));
    }
  }, []);

  // Worst-case time until the card answers again. Only an estimate for the on-screen
  // counter: what really decides is `waitForCard` below, which resolves the moment the key
  // answers (by touch, or by its own timeout).
  const busyFor = Math.ceil(cooldownRemaining() / 1000);
  const waitingRef = useRef<TouchHandle | null>(null);

  // The screen clock. It only runs when there is a counter to move, aligned to the second
  // boundary. Vicinae re-serializes the whole tree on every tick, so a tick that changes
  // nothing visible is pure waste, and a drifting setInterval can spend two in one second.
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
   * Hangs on the card until it frees up, then refreshes the screen.
   *
   * If the user touches the key, this resolves at once: the touch completes the pending
   * operation and releases the card, even with nobody reading the code. It is the only
   * fast way out.
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
        // Gave up, or the key is gone: the normal load (or the user) takes it from here.
      })
      .finally(() => {
        waitingRef.current = null;
        clearCooldown();
        setNow(Date.now() / 1000);
      });
  }, []);

  useEffect(() => {
    // Reopening the command inside the 15s window lands here: the card is still held from
    // the previous cancellation, so we wait for it to free up instead of sending a command
    // that would just hang.
    if (cooldownRemaining() > 0) waitForFreeCard();
    else load();

    // Esc unmounts the command. Without this cleanup, a pending touch would leave its
    // connection open, and the wait for the card would keep running for nothing.
    return () => {
      handleRef.current?.cancel();
      handleRef.current = null;
      waitingRef.current?.cancel();
      waitingRef.current = null;
      disposeOath();
    };
  }, [load, waitForFreeCard]);

  // Reload when the 30s window rolls over. The trigger is the `validTo` the card gave us,
  // not `Date.now() % 30`: that way a fast host clock does not expire the code early.
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
      const outcome = await pasteAndForget(value);
      // The main window is already closed at this point, so a toast would have nowhere to
      // land; a HUD is the only way left to tell the user the code stayed in the history.
      if (outcome === "purge-failed") await showHUD(t("otp.purge.failed"));
    } catch (err) {
      // Same reason as above: pasteAndForget already closed the main window.
      await showHUD(`${t("otp.paste.failed")} — ${label}: ${localizeError(err)}`);
    }
  }, []);

  /** Touch (and HOTP) accounts only give a code on explicit request, with a finger on the key. */
  const withTouch = useCallback(
    async (cred: Cred) => {
      if (touchingRef.current) return;

      // Asking for a touch while the card is still held from the previous cancellation would
      // only buy a silent wait of up to 15s before the key even blinks.
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
        // Both cancelling and timing out leave the card waiting for the finger, so we hang on
        // it; if the user touches the key, we come back.
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

  // `wrong_password` lands here too: it means the stored key no longer matches, usually because
  // the OATH password was changed elsewhere. Without this the screen falls through to an empty
  // list with no way to type the new password, and the stale key is never replaced.
  if (errCode(state.error) === "locked" || errCode(state.error) === "wrong_password") {
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
      // The id has to be stable: without it, the re-render every second can move the
      // selection and Enter would paste the wrong account's code.
      id={cred.id}
      title={code ? formatCode(code.value) : HIDDEN}
      subtitle={subtitle}
      // The title is the code, so searching by name depends on these keywords.
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

/** OATH is password-protected and ykman has nothing stored for it on this machine. */
function LockedView({ onUnlocked }: { onUnlocked: () => void }) {
  const [loading, setLoading] = useState(false);
  const { pop } = useNavigation();

  const submit = async (values: Form.Values) => {
    const password = String(values.password ?? "");
    if (!password) return;

    const remember = Boolean(values.remember);
    setLoading(true);
    try {
      const persisted = await oath().unlock(password, remember);
      onUnlocked();
      pop();
      if (remember && !persisted) {
        await showToast({
          style: Toast.Style.Failure,
          title: t("unlock.remember.failed"),
          message: t("unlock.remember.failed.detail"),
        });
      }
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
