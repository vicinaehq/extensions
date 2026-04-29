export type ItemType = 1 | 2 | 3 | 4; // 1 login, 2 secure note, 3 card, 4 identity

export interface Uri {
  match: number | null;
  uri: string;
}

export interface Login {
  username: string | null;
  password: string | null;
  totp: string | null;
  uris: Uri[] | null;
  passwordRevisionDate: string | null;
  /** Cache-only marker: true if the original item had a TOTP secret. Set by stripSensitive. */
  hasTotp?: boolean;
  /** Cache-only marker: true if the original item had a password. Set by stripSensitive. */
  hasPassword?: boolean;
}

export interface Card {
  cardholderName: string | null;
  brand: string | null;
  number: string | null;
  expMonth: string | null;
  expYear: string | null;
  code: string | null;
}

export interface Identity {
  title: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  ssn: string | null;
  username: string | null;
  passportNumber: string | null;
  licenseNumber: string | null;
}

export interface SecureNote {
  type: 0;
}

export interface Field {
  name: string;
  value: string | null;
  type: 0 | 1 | 2 | 3; // text, hidden, boolean, linked
}

export interface Item {
  object: "item";
  id: string;
  organizationId: string | null;
  folderId: string | null;
  type: ItemType;
  reprompt: 0 | 1;
  name: string;
  notes: string | null;
  favorite: boolean;
  fields?: Field[];
  login?: Login;
  card?: Card;
  identity?: Identity;
  secureNote?: SecureNote;
  collectionIds: string[] | null;
  revisionDate: string;
  creationDate: string;
  deletedDate: string | null;
}

export interface Folder {
  object: "folder";
  id: string | null;
  name: string;
}

export type SendType = 0 | 1; // 0 text, 1 file

export interface Send {
  object: "send";
  id: string;
  accessId: string;
  type: SendType;
  name: string;
  notes: string | null;
  key: string;
  maxAccessCount: number | null;
  accessCount: number;
  revisionDate: string;
  expirationDate: string | null;
  deletionDate: string;
  password: string | null;
  disabled: boolean;
  hideEmail: boolean;
  text?: { text: string; hidden: boolean };
  file?: { fileName: string; size: string; sizeName: string };
  accessUrl: string;
}

export type LockStatus = "unauthenticated" | "locked" | "unlocked";

export interface Status {
  serverUrl: string | null;
  lastSync: string | null;
  userEmail: string | null;
  userId: string | null;
  status: LockStatus;
}
