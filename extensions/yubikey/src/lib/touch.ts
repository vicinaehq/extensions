import { Cache } from "@vicinae/api";
import { PcscConnection } from "./pcsc";
import { loadAccessKey } from "./secrets";
import { type Code, type CodesResult, OathError, calculate, calculateAll, select, validate } from "./ykoath";
import { prefs } from "./oath-session";

/**
 * Quanto tempo o cartão fica inacessível depois de um toque abandonado.
 *
 * Medido: ~15s. Uma vez que o CALCULATE de uma conta com toque chega ao cartão, o applet fica
 * esperando o dedo e não responde a mais nada até o timeout interno dele.
 *
 * Não existe como abortar por software (testado à exaustão: SCardCancel, reset e unpower via
 * pcsc, USBDEVFS_RESET, tudo falha; o timer roda no firmware e a porta USB não corta a energia).
 * Só tocar ou desplugar encerra. A UI convive com isso: espera o cartão, e pede o toque.
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
 * Destrava e resolve a conexão de toque. Usa uma conexão PRÓPRIA (segundo socket), separada da
 * sessão principal, porque o CALCULATE de toque segura a transação por até 15s e congelaria a
 * lista se compartilhasse a conexão.
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
 * Pede um código que exige toque físico.
 *
 * Antes isto spawnava um processo Python de 58 MB; agora é só um segundo socket. Cancelar fecha
 * a conexão, mas o cartão continua preso até o firmware desistir (~15s), então marcamos o
 * cooldown. Se o usuário tocar, o CALCULATE resolve na hora.
 */
export function requestTouchCode(credId: string, period: number): TouchHandle {
  const timeoutS = Number(prefs().touchTimeout) || DEFAULT_TIMEOUT_S;

  let settled = false;
  let cancel: () => void = () => {};
  let onCancel: (() => void) | null = null;

  const promise = new Promise<Code>((resolve, reject) => {
    const finish = (fn: () => void, abandoned: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (abandoned) setCooldown();
      else clearCooldown();
      onCancel?.();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new OathError("touch_timeout", "The YubiKey was not touched in time")), true);
    }, timeoutS * 1000);

    cancel = () => finish(() => reject(new OathError("cancelled", "Touch cancelled")), true);

    withOwnConnection(async (conn) => {
      // A conexão é fechada por `withOwnConnection`; guardamos como fechar cedo no cancelamento.
      onCancel = () => conn.close().catch(() => {});
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
 * Espera o cartão se soltar depois de um toque abandonado, e devolve os códigos.
 *
 * Resolve no instante em que o cartão responde: se o usuário tocar, sai na hora; se ignorar, sai
 * quando o firmware desistir (~15s). É um `calculateAll` que fica pendurado na transação.
 */
export function waitForCard(): TouchHandle {
  let settled = false;
  let cancel: () => void = () => {};
  let onCancel: (() => void) | null = null;

  const promise = new Promise<Code>((resolve, reject) => {
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearCooldown();
      onCancel?.();
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new OathError("card", "The YubiKey is still busy"))), 25_000);
    cancel = () => finish(() => reject(new OathError("cancelled", "cancelled")));

    withOwnConnection(async (conn) => {
      onCancel = () => conn.close().catch(() => {});
      return conn.transaction(async (t) => {
        const info = await select(t);
        if (info.challenge) {
          const key = await loadAccessKey(info.deviceId);
          if (key) await validate(t, key, info.challenge);
        }
        return calculateAll(t);
      });
    })
      // O consumidor trata o resultado como CodesResult; empacotamos no shape de Code para reusar
      // o TouchHandle. A tela lê via `as unknown`.
      .then((codes) => finish(() => resolve(codes as unknown as Code)))
      .catch((err) => finish(() => reject(err)));
  });

  return { promise, cancel: () => cancel() };
}

export type { CodesResult };
