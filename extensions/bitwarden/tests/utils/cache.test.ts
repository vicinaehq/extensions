import { describe, it, expect } from "vitest";
import { stripSensitive } from "../../src/utils/cache";
import type { Item } from "../../src/types/bitwarden";

const sample: Item = {
  object: "item", id: "1", organizationId: null, folderId: "f1", type: 1, reprompt: 0,
  name: "GitHub", notes: "secret note", favorite: false,
  fields: [{ name: "pin", value: "1234", type: 1 }],
  login: { username: "u", password: "p", totp: "JBSWY...", uris: [{ match: null, uri: "https://github.com" }], passwordRevisionDate: null },
  collectionIds: null, revisionDate: "", creationDate: "", deletedDate: null,
};

describe("cache.stripSensitive", () => {
  it("removes password, totp, notes, custom fields, card, identity", () => {
    const stripped = stripSensitive([sample])[0]!;
    expect(stripped.notes).toBeNull();
    expect(stripped.fields).toBeUndefined();
    expect(stripped.login?.password).toBeNull();
    expect(stripped.login?.totp).toBeNull();
    expect(stripped.login?.username).toBe("u"); // username kept
    expect(stripped.login?.uris).toEqual(sample.login?.uris);
  });

  it("strips card.number/code and identity SSN/passport/license", () => {
    const card: Item = {
      ...sample, id: "2", type: 3, login: undefined,
      card: { cardholderName: "A", brand: "visa", number: "4111", expMonth: "01", expYear: "30", code: "123" },
    };
    const ident: Item = {
      ...sample, id: "3", type: 4, login: undefined,
      identity: { title: "Mr", firstName: "F", middleName: null, lastName: "L", address1: null, address2: null, address3: null,
        city: null, state: null, postalCode: null, country: null, company: null, email: null, phone: null,
        ssn: "123-45-6789", username: null, passportNumber: "P1", licenseNumber: "L1" },
    };
    const out = stripSensitive([card, ident]);
    expect(out[0]!.card).toBeUndefined();
    expect(out[1]!.identity?.ssn).toBeNull();
    expect(out[1]!.identity?.passportNumber).toBeNull();
    expect(out[1]!.identity?.licenseNumber).toBeNull();
    expect(out[1]!.identity?.firstName).toBe("F");
  });
});

