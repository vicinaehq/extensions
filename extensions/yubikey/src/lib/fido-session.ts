import { Ctap2, type FidoCred, type FidoInfo } from "./ctap2";
import { CtapError, HidDevice, HidError } from "./hid";

/**
 * Native FIDO2 session: opens /dev/hidraw, negotiates the CTAPHID channel and speaks CTAP2.
 *
 * Replaces the Python passkey helper. With this, the whole extension (OTP, PIV, FIDO2) runs
 * with no Python and no native addons. Opens per operation: the keys screen is cold.
 */
export class FidoSession {
  private async withDevice<T>(fn: (ctap: Ctap2) => Promise<T> | T): Promise<T> {
    const dev = new HidDevice();
    // open() is inside the try: it can fail *after* the hidraw descriptor is open (the CTAPHID
    // INIT handshake runs there), and a descriptor leaked per retry adds up fast on a screen
    // whose whole job is retrying.
    try {
      await dev.open();
      const ctap = new Ctap2(dev);
      await ctap.init();
      return await fn(ctap);
    } finally {
      dev.close();
    }
  }

  /** FIDO2 state: whether a PIN is set, retries left, free slots. Does not send the PIN. */
  async info(): Promise<FidoInfo> {
    return this.withDevice((ctap) => {
      const info = ctap.getInfo();
      return { ...info, pinRetries: ctap.pinRetries() };
    });
  }

  /** Lists the resident passkeys. Sends the PIN. */
  async listCredentials(pin: string): Promise<FidoCred[]> {
    return this.withDevice((ctap) => ctap.listCredentials(pin));
  }

  /** Deletes a resident passkey. Sends the PIN. */
  async deleteCredential(pin: string, credentialIdHex: string): Promise<void> {
    return this.withDevice((ctap) => ctap.deleteCredential(pin, credentialIdHex));
  }
}

let session: FidoSession | null = null;

export function fido(): FidoSession {
  if (!session) session = new FidoSession();
  return session;
}

export { CtapError, HidError };
export type { FidoCred, FidoInfo };
