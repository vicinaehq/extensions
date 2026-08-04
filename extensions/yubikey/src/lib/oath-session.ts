import { getPreferenceValues } from "@vicinae/api";
import { PcscConnection, PcscError } from "./pcsc";
import { loadAccessKey, rememberInSession, saveAccessKey } from "./secrets";
import {
  type CodesResult,
  type Code,
  OathError,
  calculate,
  calculateAll,
  deriveKey,
  select,
  validate,
} from "./ykoath";

type Prefs = {
  pcscSocket?: string;
  serial?: string;
  purgeClipboardHistory?: boolean;
  touchTimeout?: string;
};

export function prefs(): Prefs {
  return getPreferenceValues<Prefs>();
}

/**
 * Native OATH session: owns a PC/SC connection, reused across operations.
 *
 * Replaces the old Python helper (58 MB of RSS, ~1s to boot). Here the connection lives inside
 * the extension's own runtime and each operation costs ~5-10 ms.
 *
 * Unlocking is transparent: the access key comes from the Secret Service (imported from ykman's
 * keystore the first time), so the user only sees a password prompt if they never used the key.
 */
export class OathSession {
  private conn: PcscConnection | null = null;
  private deviceId: string | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  private async ensureConnected(): Promise<PcscConnection> {
    if (this.conn) {
      this.touchIdle();
      return this.conn;
    }
    const conn = new PcscConnection(prefs().pcscSocket);
    await conn.connect(prefs().serial?.trim());
    this.conn = conn;
    this.touchIdle();
    return conn;
  }

  /** Closes the connection after 60s idle: we do not hold the card when nobody is on screen. */
  private touchIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close(), 60_000);
    this.idleTimer.unref?.();
  }

  /**
   * Unlocks the applet when needed, using the stored key.
   *
   * The auth state dies on every re-SELECT, so this runs inside every transaction. Throws
   * OathError("locked") when there is no stored key, and the UI then asks for the password.
   */
  private async authenticate(t: Parameters<Parameters<PcscConnection["transaction"]>[0]>[0]) {
    const info = await select(t);
    this.deviceId = info.deviceId;
    if (!info.challenge) return info; // already unlocked

    const key = await loadAccessKey(info.deviceId);
    if (!key) throw new OathError("locked", "The OATH application is password-protected");

    await validate(t, key, info.challenge);
    return info;
  }

  /** All the codes. The only operation that also reveals which accounts require a touch. */
  async codes(timestamp?: number): Promise<CodesResult> {
    const conn = await this.ensureConnected();
    return conn.transaction(async (t) => {
      await this.authenticate(t);
      return calculateAll(t, timestamp);
    });
  }

  /** Unlocks with a password the user typed, and stores the key for next time. */
  async unlock(password: string, remember: boolean): Promise<void> {
    const conn = await this.ensureConnected();
    await conn.transaction(async (t) => {
      const info = await select(t);
      if (!info.challenge) return; // it was already unlocked
      const key = deriveKey(password, info.salt);
      await validate(t, key, info.challenge);
      this.deviceId = info.deviceId;
      if (remember) await saveAccessKey(info.deviceId, key);
      else rememberInSession(info.deviceId, key);
    });
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    await this.conn?.close();
    this.conn = null;
  }
}

let session: OathSession | null = null;

export function oath(): OathSession {
  if (!session) session = new OathSession();
  return session;
}

export function disposeOath() {
  session?.close();
  session = null;
}

export { OathError, PcscError };
export type { Code, CodesResult };
