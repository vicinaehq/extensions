import { Ctap2, type FidoCred, type FidoInfo } from "./ctap2";
import { CtapError, HidDevice, HidError, findFidoDevice } from "./hid";

/**
 * Sessão FIDO2 nativa: abre o /dev/hidraw, negocia o canal CTAPHID e fala CTAP2.
 *
 * Substitui o helper Python das passkeys. Com isto, a extensão inteira (OTP, PIV, FIDO2) roda
 * sem nenhuma dependência externa. Abre por operação: a tela de chaves é fria.
 */
export class FidoSession {
  /** Se a interface FIDO existe e está acessível. Barato: só olha o sysfs. */
  available(): boolean {
    return findFidoDevice() !== null;
  }

  private async withDevice<T>(fn: (ctap: Ctap2) => Promise<T> | T): Promise<T> {
    const dev = new HidDevice();
    await dev.open();
    try {
      const ctap = new Ctap2(dev);
      await ctap.init();
      return await fn(ctap);
    } finally {
      dev.close();
    }
  }

  /** Estado do FIDO2: PIN definido, tentativas, slots livres. Não envia o PIN. */
  async info(): Promise<FidoInfo> {
    return this.withDevice((ctap) => {
      const info = ctap.getInfo();
      return { ...info, pinRetries: ctap.pinRetries() };
    });
  }

  /** Lista as passkeys residentes. Envia o PIN. */
  async listCredentials(pin: string): Promise<FidoCred[]> {
    return this.withDevice((ctap) => ctap.listCredentials(pin));
  }

  /** Apaga uma passkey residente. Envia o PIN. */
  async deleteCredential(pin: string, credentialIdHex: string): Promise<void> {
    return this.withDevice((ctap) => ctap.deleteCredential(pin, credentialIdHex));
  }
}

let session: FidoSession | null = null;

export function fido(): FidoSession {
  if (!session) session = new FidoSession();
  return session;
}

/** Traduz um CtapError (status CTAP2) numa mensagem acionável. */
export function describeCtapError(err: unknown): string {
  if (err instanceof CtapError) {
    switch (err.status) {
      case 0x31:
        return "PIN incorreto";
      case 0x34:
        return "Muitas tentativas seguidas. Retire a YubiKey e insira de novo.";
      case 0x35:
        return "PIN bloqueado. Retire a YubiKey e insira de novo.";
      case 0x36:
        return "PIN bloqueado. É preciso redefini-lo (reset do FIDO2).";
      default:
        return `A YubiKey recusou (status 0x${err.status.toString(16)})`;
    }
  }
  if (err instanceof HidError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export { CtapError, HidError };
export type { FidoCred, FidoInfo };
