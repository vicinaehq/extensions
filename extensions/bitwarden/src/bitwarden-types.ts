/** Bitwarden item type enum (matching `bw` CLI output) */
export const ItemType = {
  Login: 1,
  SecureNote: 2,
  Card: 3,
  Identity: 4,
} as const;

export type ItemTypeValue = (typeof ItemType)[keyof typeof ItemType];

export interface BwItem {
  id: string;
  organizationId: string | null;
  folderId: string | null;
  type: ItemTypeValue;
  name: string;
  notes: string | null;
  favorite: boolean;
  login?: BwLogin;
  secureNote?: BwSecureNote;
  card?: BwCard;
  identity?: BwIdentity;
  fields?: BwField[];
  revisionDate: string;
  creationDate: string;
  deletedDate: string | null;
  collectionIds: string[] | null;
}

interface BwLogin {
  username: string | null;
  password: string | null;
  totp: string | null;
  uris?: { uri: string; match: number | null }[];
  passwordRevisionDate?: string | null;
}

interface BwSecureNote {
  type: number;
}

interface BwCard {
  cardholderName: string | null;
  brand: string | null;
  number: string | null;
  expMonth: string | null;
  expYear: string | null;
  code: string | null;
}

interface BwIdentity {
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

interface BwField {
  name: string;
  value: string;
  type: number;
  linkedId: number | null;
}

export interface BwFolder {
  id: string;
  name: string;
}

/** Error class for `bw` CLI failures */
export class BwError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BwError';
  }
}
