export type Preferences = {
  readOnlyMode: boolean;
  showImages: boolean;
  showFavicons: boolean;
  allowInsecureLoopbackTls: boolean;
  messageDownloadLimitMb: string;
};

type BaseMailAccount = {
  path: string;
  id: string;
  name: string;
  email: string;
};

export type ImapMailAccount = BaseMailAccount & {
  backend: "imap";
  host: string;
  user: string;
  port: number;
  secure: boolean;
  startTls: boolean;
};

export type GraphMailAccount = BaseMailAccount & {
  backend: "microsoft-graph";
};

export type GoaMailAccount = ImapMailAccount | GraphMailAccount;

export type Mailbox = {
  accountId: string;
  path: string;
  name: string;
  specialUse?: string;
};

export type EmailAttachment = {
  name: string;
  mimeType: string;
};

export type EmailMessage = {
  id: string;
  accountId: string;
  accountName: string;
  accountEmail: string;
  remoteId: string;
  mailboxPath: string;
  messageId?: string;
  subject: string;
  from: string;
  date?: Date;
  unread: boolean;
  attachments: EmailAttachment[];
};
