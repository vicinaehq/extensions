import type { Item } from "../types/bitwarden";

export function stripSensitive(items: Item[]): Item[] {
  return items.map((i) => {
    const out: Item = { ...i, notes: null };
    delete out.fields;
    if (out.login) {
      const hasTotp = !!out.login.totp;
      const hasPassword = !!out.login.password;
      out.login = { ...out.login, password: null, totp: null, hasTotp, hasPassword };
    }
    if (out.card) delete out.card;
    if (out.secureNote) delete out.secureNote;
    if (out.identity) {
      out.identity = { ...out.identity, ssn: null, passportNumber: null, licenseNumber: null };
    }
    return out;
  });
}
