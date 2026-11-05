import { createCipheriv, createDecipheriv, createHash, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { type CborMap, type CborValue, decode, encode } from "./cbor";
import { CtapError, HidDevice } from "./hid";

/**
 * CTAP2: getInfo, ClientPin (unlocking with the PIN) and CredentialManagement (list/delete
 * passkeys).
 *
 * The delicate part is the PIN protocol. A mistake in the key derivation or in the PIN hash
 * makes the key count a failed attempt, and three in a row lock FIDO2 until it is replugged.
 * That is why the crypto here was validated byte for byte against the reference library before
 * any real request was ever sent.
 */

const CMD = {
  GET_INFO: 0x04,
  CLIENT_PIN: 0x06,
  CREDENTIAL_MGMT: 0x0a,
} as const;

// ---------------------------------------------------------------------------
// PIN/UV protocol
// ---------------------------------------------------------------------------

export interface PinProtocol {
  readonly version: number;
  /** Derives the shared secret from the authenticator's COSE public key. */
  encapsulate(peerCose: CborMap): { keyAgreement: Map<number, number | Buffer>; sharedSecret: Buffer };
  encrypt(key: Buffer, plaintext: Buffer): Buffer;
  decrypt(key: Buffer, ciphertext: Buffer): Buffer;
  authenticate(key: Buffer, message: Buffer): Buffer;
}

/** Generates a P-256 key pair and returns the COSE public key plus the private one for ECDH. */
function ephemeralKeyAgreement(): {
  cose: Map<number, number | Buffer>;
  privateKey: import("node:crypto").KeyObject;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  const cose = new Map<number, number | Buffer>([
    [1, 2], // kty: EC2
    [3, -25], // alg: ECDH-ES+HKDF-256 (the spec mandates this value even though it is not what is used)
    [-1, 1], // crv: P-256
    [-2, x],
    [-3, y],
  ]);
  return { cose, privateKey };
}

/** Rebuilds the authenticator's public key (COSE) as a KeyObject for the ECDH. */
function coseToPublicKey(cose: CborMap): import("node:crypto").KeyObject {
  const x = cose.get(-2) as Buffer;
  const y = cose.get(-3) as Buffer;
  return createPublicKey({
    key: { kty: "EC", crv: "P-256", x: x.toString("base64url"), y: y.toString("base64url") },
    format: "jwk",
  });
}

/** O segredo bruto do ECDH: a coordenada X do ponto compartilhado. */
function ecdh(privateKey: import("node:crypto").KeyObject, peerCose: CborMap): Buffer {
  const publicKey = coseToPublicKey(peerCose);
  return diffieHellman({ privateKey, publicKey });
}

/** Protocol v1: SHA-256(Z) as the key, AES-256-CBC with a zero IV, HMAC truncated to 16 bytes. */
class PinProtocolV1 implements PinProtocol {
  readonly version = 1;
  private static IV = Buffer.alloc(16, 0);

  encapsulate(peerCose: CborMap) {
    const { cose, privateKey } = ephemeralKeyAgreement();
    const z = ecdh(privateKey, peerCose);
    return { keyAgreement: cose, sharedSecret: createHash("sha256").update(z).digest() };
  }
  encrypt(key: Buffer, plaintext: Buffer): Buffer {
    const c = createCipheriv("aes-256-cbc", key, PinProtocolV1.IV);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(plaintext), c.final()]);
  }
  decrypt(key: Buffer, ciphertext: Buffer): Buffer {
    const d = createDecipheriv("aes-256-cbc", key, PinProtocolV1.IV);
    d.setAutoPadding(false);
    return Buffer.concat([d.update(ciphertext), d.final()]);
  }
  authenticate(key: Buffer, message: Buffer): Buffer {
    return createHmac("sha256", key).update(message).digest().subarray(0, 16);
  }
}

/** Protocol v2: HKDF splits the HMAC and AES keys; random IV prefixed; full HMAC. */
class PinProtocolV2 implements PinProtocol {
  readonly version = 2;
  private static SALT = Buffer.alloc(32, 0);

  encapsulate(peerCose: CborMap) {
    const { cose, privateKey } = ephemeralKeyAgreement();
    const z = ecdh(privateKey, peerCose);
    const hmacKey = Buffer.from(hkdfSync("sha256", z, PinProtocolV2.SALT, Buffer.from("CTAP2 HMAC key"), 32));
    const aesKey = Buffer.from(hkdfSync("sha256", z, PinProtocolV2.SALT, Buffer.from("CTAP2 AES key"), 32));
    return { keyAgreement: cose, sharedSecret: Buffer.concat([hmacKey, aesKey]) };
  }
  encrypt(key: Buffer, plaintext: Buffer): Buffer {
    const aesKey = key.subarray(32);
    const iv = randomBytes(16);
    const c = createCipheriv("aes-256-cbc", aesKey, iv);
    c.setAutoPadding(false);
    return Buffer.concat([iv, c.update(plaintext), c.final()]);
  }
  decrypt(key: Buffer, ciphertext: Buffer): Buffer {
    const aesKey = key.subarray(32);
    const iv = ciphertext.subarray(0, 16);
    const d = createDecipheriv("aes-256-cbc", aesKey, iv);
    d.setAutoPadding(false);
    return Buffer.concat([d.update(ciphertext.subarray(16)), d.final()]);
  }
  authenticate(key: Buffer, message: Buffer): Buffer {
    const hmacKey = key.subarray(0, 32);
    return createHmac("sha256", hmacKey).update(message).digest();
  }
}

export function pinProtocol(version: number): PinProtocol {
  return version === 1 ? new PinProtocolV1() : new PinProtocolV2();
}

// ---------------------------------------------------------------------------
// ClientPin
// ---------------------------------------------------------------------------

const CLIENT_PIN_SUB = {
  GET_PIN_RETRIES: 0x01,
  GET_KEY_AGREEMENT: 0x02,
  GET_TOKEN_USING_PIN_LEGACY: 0x05,
  GET_TOKEN_USING_PIN: 0x09,
} as const;

const PERMISSION_CREDENTIAL_MGMT = 0x04;

export type FidoInfo = {
  pinSet: boolean;
  pinRetries: number | null;
  minPinLength: number;
  remainingCreds: number | null;
  aaguid: string;
};

export type FidoCred = {
  credentialId: string;
  rpId: string | null;
  rpName: string | null;
  userName: string | null;
  displayName: string | null;
  userId: string;
};

export class Ctap2 {
  private info!: CborMap;
  private protocol!: PinProtocol;

  constructor(private dev: HidDevice) {}

  private call(cmd: number, payload: Buffer): CborMap {
    const raw = this.dev.sendCbor(cmd, payload);
    return raw.length > 0 ? (decode(raw) as CborMap) : new Map();
  }

  async init(): Promise<void> {
    this.info = this.call(CMD.GET_INFO, Buffer.alloc(0));
    const protos = (this.info.get(0x06) as number[]) ?? [1];
    // Prefer v2 when the key supports it.
    this.protocol = pinProtocol(protos.includes(2) ? 2 : 1);
  }

  getInfo(): FidoInfo {
    const opts = (this.info.get(0x04) as Map<string, boolean>) ?? new Map();
    return {
      pinSet: opts.get("clientPin") === true,
      pinRetries: null, // filled in by pinRetries() on demand
      minPinLength: (this.info.get(0x0d) as number) ?? 4,
      remainingCreds: (this.info.get(0x14) as number) ?? null,
      aaguid: (this.info.get(0x03) as Buffer).toString("hex"),
    };
  }

  pinRetries(): number | null {
    const clientPinArgs = new Map<number, number>([
      [1, this.protocol.version],
      [2, CLIENT_PIN_SUB.GET_PIN_RETRIES],
    ]);
    const resp = this.call(CMD.CLIENT_PIN, encode(clientPinArgs));
    return (resp.get(0x03) as number) ?? null;
  }

  /**
   * Gets a PIN/UV token for managing credentials.
   *
   * CAREFUL: a wrong PIN consumes an attempt, and three in a row lock FIDO2. The crypto here is
   * validated offline against the reference before it ever runs for real.
   */
  private getPinToken(pin: string): Buffer {
    // 1) get the authenticator's ephemeral public key
    const ka = this.call(
      CMD.CLIENT_PIN,
      encode(new Map<number, number>([[1, this.protocol.version], [2, CLIENT_PIN_SUB.GET_KEY_AGREEMENT]])),
    );
    const peerCose = ka.get(0x01) as CborMap;

    // 2) derive the shared secret and encrypt the PIN hash
    const { keyAgreement, sharedSecret } = this.protocol.encapsulate(peerCose);
    const pinHash = createHash("sha256").update(Buffer.from(pin, "utf8")).digest().subarray(0, 16);
    const pinHashEnc = this.protocol.encrypt(sharedSecret, pinHash);

    // 3) ask for the token, with the credential-management permission
    const tokenSupported = this.tokenWithPermissionsSupported();
    const args = new Map<number, number | Buffer | Map<number, number | Buffer>>([
      [1, this.protocol.version],
      [2, tokenSupported ? CLIENT_PIN_SUB.GET_TOKEN_USING_PIN : CLIENT_PIN_SUB.GET_TOKEN_USING_PIN_LEGACY],
      [3, keyAgreement],
      [6, pinHashEnc],
    ]);
    if (tokenSupported) args.set(9, PERMISSION_CREDENTIAL_MGMT);

    const resp = this.call(CMD.CLIENT_PIN, encode(args));
    const tokenEnc = resp.get(0x02) as Buffer;
    return this.protocol.decrypt(sharedSecret, tokenEnc);
  }

  private tokenWithPermissionsSupported(): boolean {
    const opts = (this.info.get(0x04) as Map<string, boolean>) ?? new Map();
    return opts.get("pinUvAuthToken") === true;
  }

  // ------------- CredentialManagement -------------

  private credMgmt(subCmd: number, params: CborValue | null, token: Buffer): CborMap {
    // The parameters go into the request as a MAP (not as a byte string), but pinUvAuthParam is
    // computed over their encoding: authenticate(token, subCmd || cbor(params)). Embedding the
    // already-encoded params would make the encoder wrap them in a byte string, and the key
    // would reject it with INVALID_PARAMETER.
    const paramsEncoded = params !== null ? encode(params) : Buffer.alloc(0);
    const msg = Buffer.concat([Buffer.from([subCmd]), paramsEncoded]);
    const authParam = this.protocol.authenticate(token, msg);

    const args = new Map<number, CborValue>([[1, subCmd]]);
    if (params !== null) args.set(2, params);
    args.set(3, this.protocol.version);
    args.set(4, authParam);

    return this.call(CMD.CREDENTIAL_MGMT, encode(args));
  }

  /** Lists every resident passkey. Requires the PIN. */
  async listCredentials(pin: string): Promise<FidoCred[]> {
    const token = this.getPinToken(pin);
    const creds: FidoCred[] = [];

    // getCredsMetadata (0x01) first: with no credentials, enumerateRPsBegin would return an
    // error. This is what the reference client does.
    const meta = this.credMgmt(0x01, null, token);
    const existing = (meta.get(0x01) as number) ?? 0;
    if (existing === 0) return creds;

    // enumerateRPsBegin (0x02) → total; then enumerateRPsGetNextRP (0x03)
    const rpBegin = this.credMgmt(0x02, null, token);
    const totalRps = (rpBegin.get(0x05) as number) ?? 0;
    if (totalRps === 0) return creds;

    const rps: { rpIdHash: Buffer; rpId: string | null; rpName: string | null }[] = [];
    const readRp = (m: CborMap) => {
      const rp = m.get(0x03) as Map<string, string> | undefined;
      rps.push({
        rpIdHash: m.get(0x04) as Buffer,
        rpId: rp?.get("id") ?? null,
        rpName: rp?.get("name") ?? null,
      });
    };
    readRp(rpBegin);
    for (let i = 1; i < totalRps; i++) readRp(this.credMgmt(0x03, null, token));

    // for each RP, enumerateCredentialsBegin (0x04) + GetNextCredential (0x05)
    for (const rp of rps) {
      const params = new Map<number, Buffer>([[1, rp.rpIdHash]]);
      const first = this.credMgmt(0x04, params, token);
      const totalCreds = (first.get(0x09) as number) ?? 0;
      if (totalCreds === 0) continue;

      const readCred = (m: CborMap) => {
        const user = m.get(0x06) as Map<string, string | Buffer> | undefined;
        const credId = m.get(0x07) as Map<string, string | Buffer> | undefined;
        const idBuf = credId?.get("id") as Buffer | undefined;
        const userId = user?.get("id") as Buffer | undefined;
        creds.push({
          credentialId: idBuf ? idBuf.toString("hex") : "",
          rpId: rp.rpId,
          rpName: rp.rpName,
          userName: (user?.get("name") as string) ?? null,
          displayName: (user?.get("displayName") as string) ?? null,
          userId: userId ? userId.toString("hex") : "",
        });
      };
      readCred(first);
      for (let i = 1; i < totalCreds; i++) readCred(this.credMgmt(0x05, null, token));
    }

    return creds;
  }

  /** Deletes a resident passkey by credential id (hex). Requires the PIN. */
  async deleteCredential(pin: string, credentialIdHex: string): Promise<void> {
    const token = this.getPinToken(pin);
    // params = { 2: { "id": <credId>, "type": "public-key" } }
    const credDescriptor = new Map<string, string | Buffer>([
      ["id", Buffer.from(credentialIdHex, "hex")],
      ["type", "public-key"],
    ]);
    const params = new Map<number, Map<string, string | Buffer>>([[2, credDescriptor]]);
    this.credMgmt(0x06, params, token);
  }
}

export { CtapError };
