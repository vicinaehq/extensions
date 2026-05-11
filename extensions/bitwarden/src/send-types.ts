export const SendType = {
  Text: 0,
  File: 1,
} as const;

export type SendTypeValue = (typeof SendType)[keyof typeof SendType];

export interface BwSend {
  id: string;
  accessId: string;
  name: string;
  notes: string | null;
  type: SendTypeValue;
  password: string | null;
  text: { text: string; hidden: boolean } | null;
  file: { id: string; fileName: string; size: number; sizeName: string } | null;
  maxAccessCount: number | null;
  accessCount: number;
  deletionDate: string;
  expirationDate: string | null;
  creationDate: string;
  revisionDate: string;
  disabled: boolean;
  hideEmail: boolean;
}

export interface CreateSendPayload {
  name: string;
  notes: string | null;
  type: SendTypeValue;
  text: { text: string; hidden: boolean } | null;
  file: { fileName: string } | null;
  password: string | null;
  maxAccessCount: number | null;
  deletionDate: string | null;
  expirationDate: string | null;
  disabled: boolean;
  hideEmail: boolean;
}

export interface SendAction {
  label: string;
  value: string;
}
