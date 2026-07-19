import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Transmitter } from "./pcsc";
import { PcscError } from "./pcsc";

/**
 * O protocolo YKOATH, falado direto com o applet da YubiKey.
 *
 * Referência: https://developers.yubico.com/OATH/YKOATH_Protocol.html
 * (conferido contra a implementação do yubikit, que é a que o `ykman` usa)
 */

const AID = Buffer.from([0xa0, 0x00, 0x00, 0x05, 0x27, 0x21, 0x01]);

const INS = {
  SELECT: 0xa4,
  LIST: 0xa1,
  CALCULATE: 0xa2,
  VALIDATE: 0xa3,
  CALCULATE_ALL: 0xa4,
  SEND_REMAINING: 0xa5,
} as const;

const TAG = {
  NAME: 0x71,
  NAME_LIST: 0x72,
  CHALLENGE: 0x74,
  RESPONSE: 0x75,
  TRUNCATED: 0x76,
  HOTP: 0x77,
  VERSION: 0x79,
  TOUCH: 0x7c,
} as const;

const SW = {
  OK: 0x9000,
  MORE_DATA: 0x61, // SW1; SW2 = quantos bytes faltam
  AUTH_REQUIRED: 0x6982,
  WRONG_PASSWORD: 0x6a80,
  NO_SUCH_APPLET: 0x6a82,
  TOUCH_TIMEOUT: 0x6985,
} as const;

const DEFAULT_PERIOD = 30;

export type OathType = "TOTP" | "HOTP";

export type Cred = {
  /** O id como o cartão o conhece, incluindo o prefixo de período quando != 30. */
  id: string;
  issuer: string | null;
  name: string;
  period: number;
  type: OathType;
  touch: boolean;
};

export type Code = {
  value: string;
  validFrom: number;
  validTo: number;
};

export class OathError extends Error {
  constructor(
    readonly code: "locked" | "wrong_password" | "touch_timeout" | "no_applet" | "card" | "cancelled",
    message: string,
  ) {
    super(message);
    this.name = "OathError";
  }
}

// ---------------------------------------------------------------------------
// TLV e APDU
// ---------------------------------------------------------------------------

function tlv(tag: number, value: Buffer): Buffer {
  if (value.length < 0x80) {
    return Buffer.concat([Buffer.from([tag, value.length]), value]);
  }
  // Comprimento longo: 0x80|N seguido de N bytes big-endian.
  const lenBytes: number[] = [];
  let len = value.length;
  while (len > 0) {
    lenBytes.unshift(len & 0xff);
    len >>= 8;
  }
  return Buffer.concat([Buffer.from([tag, 0x80 | lenBytes.length]), Buffer.from(lenBytes), value]);
}

type Tlv = { tag: number; value: Buffer };

function parseTlvs(buf: Buffer): Tlv[] {
  const out: Tlv[] = [];
  let p = 0;
  while (p < buf.length) {
    const tag = buf[p++];
    if (p >= buf.length) break;
    let len = buf[p++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let i = 0; i < n; i++) len = (len << 8) | buf[p++];
    }
    out.push({ tag, value: buf.subarray(p, p + len) });
    p += len;
  }
  return out;
}

/** APDU curto. Nenhum comando OATH passa de 255 bytes de dados, então não precisamos de extended. */
function apdu(ins: number, p1: number, p2: number, data?: Buffer): Buffer {
  const head = Buffer.from([0x00, ins, p1, p2]);
  if (!data || data.length === 0) return Buffer.concat([head, Buffer.from([0x00])]);
  return Buffer.concat([head, Buffer.from([data.length]), data]);
}

/**
 * Envia um APDU e junta as continuações.
 *
 * Sem isto, uma resposta maior que 255 bytes chega truncada e em silêncio: com muitas contas,
 * o CALCULATE_ALL simplesmente perderia metade delas sem erro nenhum.
 */
async function send(t: Transmitter, cmd: Buffer): Promise<Buffer> {
  let res = await t(cmd);
  const chunks: Buffer[] = [];

  for (;;) {
    const sw1 = res[res.length - 2];
    const sw2 = res[res.length - 1];
    chunks.push(res.subarray(0, -2));

    if (sw1 === SW.MORE_DATA) {
      res = await t(apdu(INS.SEND_REMAINING, 0x00, 0x00));
      continue;
    }

    const sw = (sw1 << 8) | sw2;
    if (sw === SW.OK) return Buffer.concat(chunks);

    switch (sw) {
      case SW.AUTH_REQUIRED:
        throw new OathError("locked", "The OATH application on this YubiKey is password-protected");
      case SW.WRONG_PASSWORD:
        throw new OathError("wrong_password", "Wrong password");
      case SW.TOUCH_TIMEOUT:
        throw new OathError("touch_timeout", "The YubiKey was not touched in time");
      case SW.NO_SUCH_APPLET:
        throw new OathError(
          "no_applet",
          "This key does not expose OATH. CCID may be disabled on it.",
        );
      default:
        throw new OathError("card", `The YubiKey returned an error (SW=0x${sw.toString(16)})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export type SelectInfo = {
  version: string;
  /** Identifica a chave. Derivado do salt, é o que o ykman usa como chave do keystore. */
  deviceId: string;
  /** O salt do PBKDF2. */
  salt: Buffer;
  /** Só vem quando o applet está trancado; é o desafio a responder no VALIDATE. */
  challenge: Buffer | null;
};

/** Seleciona o applet. Precisa ser refeito a cada transação: o gpg pode ter trocado de applet. */
export async function select(t: Transmitter): Promise<SelectInfo> {
  const res = await send(t, apdu(INS.SELECT, 0x04, 0x00, AID));
  const tags = parseTlvs(res);

  const get = (tag: number) => tags.find((x) => x.tag === tag)?.value ?? null;

  const version = get(TAG.VERSION);
  const salt = get(TAG.NAME);
  const challenge = get(TAG.CHALLENGE);

  if (!salt) throw new OathError("card", "The YubiKey did not return the OATH identifier");

  return {
    version: version ? Array.from(version).join(".") : "?",
    deviceId: createHash("sha256").update(salt).digest().subarray(0, 16).toString("base64").replace(/=+$/, ""),
    salt,
    // Presente ⇔ trancado. É assim que se sabe que precisa de senha.
    challenge: challenge && challenge.length > 0 ? challenge : null,
  };
}

/** Deriva a chave de acesso a partir da senha. Parâmetros ditados pelo cartão, não por nós. */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(Buffer.from(password, "utf8"), salt, 1000, 16, "sha1");
}

/**
 * Destrava o applet.
 *
 * É um desafio-resposta mútuo: além de provarmos que temos a chave, o cartão prova o mesmo
 * respondendo ao nosso desafio. A verificação da volta não é enfeite — sem ela, um cartão
 * impostor poderia aceitar qualquer coisa e nos alimentar códigos falsos.
 */
export async function validate(t: Transmitter, key: Buffer, challenge: Buffer): Promise<void> {
  const response = createHmac("sha1", key).update(challenge).digest();
  const myChallenge = randomBytes(8);

  const data = Buffer.concat([tlv(TAG.RESPONSE, response), tlv(TAG.CHALLENGE, myChallenge)]);
  const res = await send(t, apdu(INS.VALIDATE, 0x00, 0x00, data));

  const theirs = parseTlvs(res).find((x) => x.tag === TAG.RESPONSE)?.value;
  const expected = createHmac("sha1", key).update(myChallenge).digest();

  if (!theirs || theirs.length !== expected.length || !timingSafeEqual(theirs, expected)) {
    throw new OathError("card", "The YubiKey did not prove it holds the same key. Do not trust it.");
  }
}

/** Uma conta com período diferente de 30 carrega o período no próprio id: "60/Issuer:nome". */
function parseCredId(id: string, type: OathType): { issuer: string | null; name: string; period: number } {
  const m = id.match(/^(?:(\d+)\/)?(?:([^:]+):)?(.*)$/);
  const period = m?.[1] ? Number(m[1]) : type === "TOTP" ? DEFAULT_PERIOD : 0;
  return { issuer: m?.[2] ?? null, name: m?.[3] ?? id, period };
}

function decodeTruncated(value: Buffer, period: number, timestamp: number): Code {
  const digits = value[0];
  const num = value.readUInt32BE(1) & 0x7fffffff;
  const step = Math.floor(timestamp / period);
  return {
    value: String(num % 10 ** digits).padStart(digits, "0"),
    validFrom: step * period,
    validTo: (step + 1) * period,
  };
}

function challengeFor(timestamp: number, period: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(Math.floor(timestamp / period)));
  return buf;
}

export type CodesResult = { creds: Cred[]; codes: Record<string, Code | null> };

/**
 * Calcula todos os códigos de uma vez.
 *
 * É a única operação que revela quais contas exigem toque: o cartão responde com a tag 0x7C no
 * lugar do código. O comando LIST não traz essa informação, e confiar nele faria a extensão
 * tratar uma conta de toque como comum, falhando sem explicação.
 */
export async function calculateAll(t: Transmitter, timestamp = Date.now() / 1000): Promise<CodesResult> {
  const ts = Math.floor(timestamp);
  const data = tlv(TAG.CHALLENGE, challengeFor(ts, DEFAULT_PERIOD));
  const res = await send(t, apdu(INS.CALCULATE_ALL, 0x00, 0x01, data));

  const tags = parseTlvs(res);
  const creds: Cred[] = [];
  const codes: Record<string, Code | null> = {};

  // A resposta vem aos pares: 0x71 <nome> seguido do resultado daquela conta.
  for (let i = 0; i + 1 < tags.length; i += 2) {
    const nameTlv = tags[i];
    const valueTlv = tags[i + 1];
    if (nameTlv.tag !== TAG.NAME) continue;

    const id = nameTlv.value.toString("utf8");
    const type: OathType = valueTlv.tag === TAG.HOTP ? "HOTP" : "TOTP";
    const { issuer, name, period } = parseCredId(id, type);
    const touch = valueTlv.tag === TAG.TOUCH;

    creds.push({ id, issuer, name, period: period || DEFAULT_PERIOD, type, touch });

    if (valueTlv.tag !== TAG.TRUNCATED) {
      // HOTP e contas de toque não vêm com código, por natureza.
      codes[id] = null;
      continue;
    }

    if (period === DEFAULT_PERIOD) {
      codes[id] = decodeTruncated(valueTlv.value, DEFAULT_PERIOD, ts);
    } else {
      // O cartão calculou esta conta com o desafio de 30s, que é o que mandamos. Para um período
      // diferente, esse código está ERRADO: é preciso recalcular a conta individualmente com o
      // desafio certo. O ykman faz o mesmo.
      codes[id] = await calculate(t, id, period, ts);
    }
  }

  return { creds, codes };
}

/** Calcula uma conta só. Numa conta de toque, isto BLOQUEIA até o dedo ou ~15s de timeout. */
export async function calculate(
  t: Transmitter,
  credId: string,
  period: number,
  timestamp = Date.now() / 1000,
): Promise<Code> {
  const ts = Math.floor(timestamp);
  const p = period || DEFAULT_PERIOD;

  const data = Buffer.concat([
    tlv(TAG.NAME, Buffer.from(credId, "utf8")),
    tlv(TAG.CHALLENGE, challengeFor(ts, p)),
  ]);

  const res = await send(t, apdu(INS.CALCULATE, 0x00, 0x01, data));
  const truncated = parseTlvs(res).find((x) => x.tag === TAG.TRUNCATED)?.value;
  if (!truncated) throw new OathError("card", "The YubiKey did not return a code");

  return decodeTruncated(truncated, p, ts);
}

/** Traduz erros de baixo nível para algo que a UI possa mostrar sem vazar detalhe de protocolo. */
export function describeError(err: unknown): string {
  if (err instanceof OathError || err instanceof PcscError) return err.message;
  return String(err);
}
