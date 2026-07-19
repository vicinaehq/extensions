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
 * Sessão OATH nativa: dona de uma conexão PC/SC, reusada entre operações.
 *
 * Substitui o antigo helper Python (58 MB de RSS, ~1s de boot). Aqui a conexão vive dentro do
 * próprio runtime da extensão e cada operação custa ~5-10 ms.
 *
 * O destravamento é transparente: a chave de acesso vem do Secret Service (importada do keystore
 * do ykman na primeira vez), então o usuário só vê um prompt de senha se nunca tiver usado a chave.
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

  /** Fecha a conexão após 60s parada: não seguramos o cartão quando ninguém está usando a tela. */
  private touchIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close(), 60_000);
    this.idleTimer.unref?.();
  }

  /**
   * Destrava o applet se preciso, usando a chave guardada.
   *
   * O estado de auth morre a cada re-SELECT, então isto roda dentro de toda transação. Lança
   * OathError("locked") quando não há chave guardada — a UI então pede a senha.
   */
  private async authenticate(t: Parameters<Parameters<PcscConnection["transaction"]>[0]>[0]) {
    const info = await select(t);
    this.deviceId = info.deviceId;
    if (!info.challenge) return info; // já destravado

    const key = await loadAccessKey(info.deviceId);
    if (!key) throw new OathError("locked", "The OATH application is password-protected");

    await validate(t, key, info.challenge);
    return info;
  }

  /** Todos os códigos. A única operação que também revela quais contas exigem toque. */
  async codes(timestamp?: number): Promise<CodesResult> {
    const conn = await this.ensureConnected();
    return conn.transaction(async (t) => {
      await this.authenticate(t);
      return calculateAll(t, timestamp);
    });
  }

  /** Destrava com uma senha que o usuário digitou, e guarda a chave para as próximas vezes. */
  async unlock(password: string, remember: boolean): Promise<void> {
    const conn = await this.ensureConnected();
    await conn.transaction(async (t) => {
      const info = await select(t);
      if (!info.challenge) return; // já estava destravado
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
