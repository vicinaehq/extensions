import { PcscConnection, PcscError } from "./pcsc";
import { prefs } from "./oath-session";
import { type PivInfo, PivError, type SlotInfo, exportCertificate as exportCert, readInfo, select } from "./piv";

/**
 * Native PIV session: owns its own PC/SC connection, separate from the OATH session.
 *
 * The keys screen is cold (rarely opened), so keeping a connection alive is not worth it: we
 * open one per operation. The certificate and the PIN state come back in ~10 ms anyway.
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

  /** Slots, certificates and PIN state. Requires no PIN and writes nothing. */
  async info(): Promise<PivInfo> {
    return this.withConnection((conn) => conn.transaction((t) => readInfo(t)));
  }

  /** Exports a slot's certificate as PEM. */
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
