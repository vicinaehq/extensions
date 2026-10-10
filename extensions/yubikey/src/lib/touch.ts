import { Cache } from "@vicinae/api";
import { PcscConnection } from "./pcsc";
import { loadAccessKey } from "./secrets";
import { type Code, type CodesResult, OathError, calculate, calculateAll, select, validate } from "./ykoath";
import { prefs } from "./oath-session";

/**
 * How long the card stays unreachable after an abandoned touch.
 *
 * Measured: ~15s. Once the CALCULATE of a touch account reaches the card, the applet waits for
 * the finger and answers nothing else until its own internal timeout.
 *
 * There is no way to abort it in software (tested exhaustively: SCardCancel, reset and unpower
 * through pcsc, USBDEVFS_RESET, all fail; the timer runs in firmware and the USB port does not
 * cut power). Only touching or unplugging ends it. The UI lives with that: it waits for the
 * card, and asks for the touch.
 */
const COOLDOWN_MS = 15_500;

const cache = new Cache({ namespace: "yubikey-card" });
const COOLDOWN_KEY = "cooldownUntil";

function setCooldown() {
  cache.set(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS));
}
export function cooldownRemaining(): number {
  const raw = cache.get(COOLDOWN_KEY);
  return raw ? Math.max(0, Number(raw) - Date.now()) : 0;
}
export function clearCooldown() {
  cache.remove(COOLDOWN_KEY);
}

export type TouchHandle = {
  promise: Promise<Code>;
  cancel: () => void;
};

const DEFAULT_TIMEOUT_S = 16;

/**
 * Unlocks and resolves the touch connection. Uses its OWN connection (a second socket), apart
 * from the main session, because a touch CALCULATE holds the transaction for up to 15s and
 * would freeze the list if it shared the connection.
 */
async function withOwnConnection<T>(fn: (conn: PcscConnection) => Promise<T>): Promise<T> {
  const conn = new PcscConnection(prefs().pcscSocket);
  await conn.connect(prefs().serial?.trim());
  try {
    return await fn(conn);
  } finally {
    await conn.close().catch(() => {});
  }
}

/**
 * Asks for a code that requires a physical touch.
 *
 * This used to spawn a 58 MB Python process; now it is just a second socket. Cancelling closes
 * the connection, but the card stays held until the firmware gives up (~15s), so we mark the
 * cooldown. If the user touches the key, the CALCULATE resolves immediately.
 */
export function requestTouchCode(credId: string, period: number): TouchHandle {
  const timeoutS = Number(prefs().touchTimeout) || DEFAULT_TIMEOUT_S;

  let settled = false;
  let cancel: () => void = () => {};
  let onCancel: (() => void) | null = null;
  // Cancellation is tracked on its own, not through `onCancel` alone: connecting takes a
  // moment, and a cancel that lands in that window has nothing to call yet. Without this the
  // request would go on to send the touch CALCULATE and hold the card for the full timeout,
  // long after the user gave up on it.
  let cancelled = false;

  const promise = new Promise<Code>((resolve, reject) => {
    const finish = (fn: () => void, abandoned: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (abandoned) setCooldown();
      else clearCooldown();
      cancelled = true;
      onCancel?.();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new OathError("touch_timeout", "The YubiKey was not touched in time")), true);
    }, timeoutS * 1000);

    cancel = () => finish(() => reject(new OathError("cancelled", "Touch cancelled")), true);

    withOwnConnection(async (conn) => {
      // Cancelling aborts instead of closing: a touch CALCULATE is still in flight and the
      // graceful DISCONNECT would queue behind it, stranding the pending read.
      onCancel = () => conn.abort("The touch was cancelled");
      if (cancelled) {
        conn.abort("The touch was cancelled");
        throw new OathError("cancelled", "Touch cancelled");
      }
      return conn.transaction(async (t) => {
        const info = await select(t);
        if (info.challenge) {
          const key = await loadAccessKey(info.deviceId);
          if (!key) throw new OathError("locked", "The OATH application is password-protected");
          await validate(t, key, info.challenge);
        }
        return calculate(t, credId, period);
      });
    })
      .then((code) => finish(() => resolve(code), false))
      .catch((err) => {
        const abandoned = err instanceof OathError && err.code === "touch_timeout";
        finish(() => reject(err), abandoned);
      });
  });

  return { promise, cancel: () => cancel() };
}

/**
 * Waits for the card to free up after an abandoned touch, and returns the codes.
 *
 * Resolves the moment the card answers: if the user touches the key, right away; if they ignore
 * it, when the firmware gives up (~15s). It is a `calculateAll` hanging on the transaction.
 */
export function waitForCard(): TouchHandle {
  let settled = false;
  let cancel: () => void = () => {};
  let onCancel: (() => void) | null = null;
  // Same race as in requestTouchCode: a cancel during connect has no abort to call yet.
  let cancelled = false;

  const promise = new Promise<Code>((resolve, reject) => {
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearCooldown();
      cancelled = true;
      onCancel?.();
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new OathError("card", "The YubiKey is still busy"))), 25_000);
    cancel = () => finish(() => reject(new OathError("cancelled", "cancelled")));

    withOwnConnection(async (conn) => {
      onCancel = () => conn.abort("The wait for the card was cancelled");
      if (cancelled) {
        conn.abort("The wait for the card was cancelled");
        throw new OathError("cancelled", "cancelled");
      }
      return conn.transaction(async (t) => {
        const info = await select(t);
        if (info.challenge) {
          const key = await loadAccessKey(info.deviceId);
          if (key) await validate(t, key, info.challenge);
        }
        return calculateAll(t);
      });
    })
      // The consumer treats the result as CodesResult; we pack it in Code's shape to reuse
      // TouchHandle. The screen reads it back through `as unknown`.
      .then((codes) => finish(() => resolve(codes as unknown as Code)))
      .catch((err) => finish(() => reject(err)));
  });

  return { promise, cancel: () => cancel() };
}

export type { CodesResult };
