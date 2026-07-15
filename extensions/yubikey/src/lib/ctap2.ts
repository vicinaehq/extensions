import { createCipheriv, createDecipheriv, createHash, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { type CborMap, type CborValue, decode, encode } from "./cbor";
import { CtapError, HidDevice } from "./hid";

/**
 * CTAP2: getInfo, ClientPin (destravar com o PIN) e CredentialManagement (listar/apagar passkeys).
 *
 * A parte sensível é o protocolo de PIN. Um erro na derivação da chave ou no hash do PIN faz o
 * cartão contar uma tentativa errada, e três seguidas bloqueiam o FIDO2 até replugar. Por isso a
 * criptografia daqui foi validada byte a byte contra a biblioteca de referência antes de qualquer
 * envio real (ver os testes).
 */

const CMD = {
  GET_INFO: 0x04,
  CLIENT_PIN: 0x06,
  CREDENTIAL_MGMT: 0x0a,
} as const;

// ---------------------------------------------------------------------------
// Protocolo de PIN/UV
// ---------------------------------------------------------------------------

export interface PinProtocol {
  readonly version: number;
  /** Deriva o segredo compartilhado a partir da chave pública COSE do autenticador. */
  encapsulate(peerCose: CborMap): { keyAgreement: Map<number, number | Buffer>; sharedSecret: Buffer };
  encrypt(key: Buffer, plaintext: Buffer): Buffer;
  decrypt(key: Buffer, ciphertext: Buffer): Buffer;
  authenticate(key: Buffer, message: Buffer): Buffer;
}

/** Gera um par de chaves P-256 e devolve a chave pública COSE + a privada para o ECDH. */
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
    [3, -25], // alg: ECDH-ES+HKDF-256 (o spec manda este valor mesmo não sendo o usado)
    [-1, 1], // crv: P-256
    [-2, x],
    [-3, y],
  ]);
  return { cose, privateKey };
}

/** Reconstrói a chave pública do autenticador (COSE) como KeyObject para o ECDH. */
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

/** Protocolo v1: SHA-256(Z) como chave, AES-256-CBC com IV zero, HMAC truncado em 16 bytes. */
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

/** Protocolo v2: HKDF separa chaves de HMAC e AES; IV aleatório prefixado; HMAC completo. */
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
    // Prefere o v2 se a chave suportar.
    this.protocol = pinProtocol(protos.includes(2) ? 2 : 1);
  }

  getInfo(): FidoInfo {
    const opts = (this.info.get(0x04) as Map<string, boolean>) ?? new Map();
    return {
      pinSet: opts.get("clientPin") === true,
      pinRetries: null, // preenchido por pinRetries() sob demanda
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
   * Obtém um PIN/UV token para gerenciar credenciais.
   *
   * ATENÇÃO: um PIN errado consome uma tentativa; três seguidas bloqueiam o FIDO2. A
   * criptografia daqui é validada offline contra a referência antes de rodar de verdade.
   */
  private getPinToken(pin: string): Buffer {
    // 1) pega a chave pública efêmera do autenticador
    const ka = this.call(
      CMD.CLIENT_PIN,
      encode(new Map<number, number>([[1, this.protocol.version], [2, CLIENT_PIN_SUB.GET_KEY_AGREEMENT]])),
    );
    const peerCose = ka.get(0x01) as CborMap;

    // 2) deriva o segredo compartilhado e cifra o hash do PIN
    const { keyAgreement, sharedSecret } = this.protocol.encapsulate(peerCose);
    const pinHash = createHash("sha256").update(Buffer.from(pin, "utf8")).digest().subarray(0, 16);
    const pinHashEnc = this.protocol.encrypt(sharedSecret, pinHash);

    // 3) pede o token, com permissão de gerenciamento de credenciais
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
    // Os parâmetros entram no request como um MAPA (não como byte string), mas o
    // pinUvAuthParam é calculado sobre a codificação deles: authenticate(token, subCmd || cbor(params)).
    // Embutir os params já codificados faria o encoder envolvê-los num byte string, e o cartão
    // rejeitaria com INVALID_PARAMETER.
    const paramsEncoded = params !== null ? encode(params) : Buffer.alloc(0);
    const msg = Buffer.concat([Buffer.from([subCmd]), paramsEncoded]);
    const authParam = this.protocol.authenticate(token, msg);

    const args = new Map<number, CborValue>([[1, subCmd]]);
    if (params !== null) args.set(2, params);
    args.set(3, this.protocol.version);
    args.set(4, authParam);

    return this.call(CMD.CREDENTIAL_MGMT, encode(args));
  }

  /** Lista todas as passkeys residentes. Exige o PIN. */
  async listCredentials(pin: string): Promise<FidoCred[]> {
    const token = this.getPinToken(pin);
    const creds: FidoCred[] = [];

    // getCredsMetadata (0x01) primeiro: se não há credenciais, enumerateRPsBegin retornaria
    // erro. É o que o cliente de referência faz.
    const meta = this.credMgmt(0x01, null, token);
    const existing = (meta.get(0x01) as number) ?? 0;
    if (existing === 0) return creds;

    // enumerateRPsBegin (0x02) → total; depois enumerateRPsGetNextRP (0x03)
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

    // para cada RP, enumerateCredentialsBegin (0x04) + GetNextCredential (0x05)
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

  /** Apaga uma passkey residente pelo credential id (hex). Exige o PIN. */
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
