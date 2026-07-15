import { PcscConnection, PcscError } from "./pcsc";
import { prefs } from "./oath-session";
import { type PivInfo, PivError, type SlotInfo, exportCertificate as exportCert, readInfo, select } from "./piv";

/**
 * Sessão PIV nativa: dona de uma conexão PC/SC própria, separada da sessão OATH.
 *
 * A tela de chaves é fria (aberta raramente), então não vale manter conexão viva: abrimos por
 * operação. O certificado e o estado do PIN saem em ~10 ms de qualquer forma.
 */
export class PivSession {
  private async withConnection<T>(fn: (conn: PcscConnection) => Promise<T>): Promise<T> {
    const conn = new PcscConnection(prefs().pcscSocket);
    await conn.connect(prefs().serial?.trim());
    try {
      return await fn(conn);
    } finally {
      await conn.close().catch(() => {});
    }
  }

  /** Slots, certificados e estado do PIN. Não exige PIN nem escreve nada. */
  async info(): Promise<PivInfo> {
    return this.withConnection((conn) => conn.transaction((t) => readInfo(t)));
  }

  /** Exporta o certificado de um slot em PEM. */
  async exportCertificate(objectId: number): Promise<string> {
    return this.withConnection((conn) =>
      conn.transaction(async (t) => {
        await select(t);
        return exportCert(t, objectId);
      }),
    );
  }
}

let session: PivSession | null = null;

export function piv(): PivSession {
  if (!session) session = new PivSession();
  return session;
}

export { PivError, PcscError };
export type { PivInfo, SlotInfo };
