import { List, ActionPanel, Action, getPreferenceValues, showToast, Toast, LaunchProps } from "@vicinae/api";
import { useState, useEffect } from "react";

interface Preferences {
  url: string;
  username: string;
  token: string;
}

interface NextcloudEntry {
  thumbnailUrl?: string;
  title: string;
  subline: string;
  resourceUrl: string;
  icon?: string;
  rounded?: boolean;
  attributes?: {
    fileId?: string;
    path?: string;
    mimetype?: string;
    displayName?: string;
    email?: string;
    phoneNumber?: string;
    createdAt?: string;
  };
}

interface ProviderSearchResponse {
  ocs: {
    data: {
      name: string;
      isPaginated: boolean;
      entries: NextcloudEntry[];
      cursor: string | null;
    };
  };
}

interface ParsedContact {
  org?: string;
  jobTitle?: string;
  emails: string[];
  phones: string[];
  addresses: string[];
  note?: string;
  birthday?: string;
  website?: string;
}

interface ParsedEvent {
  location?: string;
  description?: string;
  status?: string;
  organizer?: string;
}

interface MailAddress {
  label: string;
  email: string;
}

interface ParsedMail {
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  hasAttachments: boolean;
  seen: boolean;
  subject?: string;
  bodyMarkdown?: string;
  previewText?: string;
}

function parseVCard(text: string): ParsedContact {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const get = (field: string) => {
    const m = unfolded.match(new RegExp(`^${field}[^:\\r\\n]*:(.+)`, "im"));
    return m ? m[1].trim() : undefined;
  };
  const getAll = (field: string) =>
    [...unfolded.matchAll(new RegExp(`^${field}[^:\\r\\n]*:(.+)`, "igm"))].map((m) => m[1].trim());
  const formatAdr = (adr: string) =>
    adr.split(";").map((p) => p.trim()).filter(Boolean).join(", ");
  return {
    org: get("ORG"),
    jobTitle: get("TITLE"),
    emails: getAll("EMAIL"),
    phones: getAll("TEL"),
    addresses: getAll("ADR").map(formatAdr),
    note: get("NOTE"),
    birthday: get("BDAY"),
    website: get("URL"),
  };
}

function parseICS(text: string): ParsedEvent {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const get = (field: string) => {
    const m = unfolded.match(new RegExp(`^${field}[^:\\r\\n]*:(.+)`, "im"));
    return m ? m[1].trim() : undefined;
  };
  const organizer = get("ORGANIZER");
  const organizerName = organizer?.match(/CN=([^;:]+)/)?.[1] ?? organizer;
  const location = get("LOCATION");
  const description = get("DESCRIPTION")?.replace(/\\n/g, "\n").replace(/\\,/g, ",");
  return {
    location: location || undefined,
    description: description || undefined,
    status: get("STATUS"),
    organizer: organizerName || undefined,
  };
}

function vCardUrlFrom(thumbnailUrl: string): string | null {
  const base = thumbnailUrl.split("?")[0];
  if (!base.includes("/dav/addressbooks/")) return null;
  return base;
}

function contactUrlFrom(entry: NextcloudEntry): string {
  const m = entry.resourceUrl.match(/^(https?:\/\/[^/]+)\/apps\/contacts\/direct\/contact\/(.+)$/);
  if (!m) return entry.resourceUrl;
  const key = Buffer.from(m[2]).toString("base64");
  return `${m[1]}/apps/contacts/All%20contacts/${key}`;
}

// The base64 in the calendar edit URL encodes the CalDAV path (already URL-encoded).
// Re-encoding each segment makes it work with the DAV server.
function calDavUrlFrom(resourceUrl: string): string | null {
  // Matches /apps/calendar/edit/{base64} or /apps/calendar/.../edit/full/{base64}
  const m = resourceUrl.match(/\/apps\/calendar\/(?:[^/]*\/)*edit\/(?:full\/)?([A-Za-z0-9+/]*={0,2})/);
  if (!m) return null;
  const origin = resourceUrl.match(/^(https?:\/\/[^/]+)/)?.[1];
  if (!origin) return null;
  const path = Buffer.from(m[1], "base64").toString("utf8");
  const encodedPath = path.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  return `${origin}${encodedPath}`;
}

// Convert a calendar resourceUrl to the dayGridMonth/now/edit/full/... format.
// The resourceUrl base64 encodes a single-encoded DAV path; the calendar app expects double-encoded.
// The createdAt timestamp (from entry.attributes.createdAt) is the event occurrence's Unix timestamp.
function calendarAppUrlFrom(resourceUrl: string, createdAt?: string): string {
  const prefixMatch = resourceUrl.match(/^(https?:\/\/[^/]+)\/apps\/calendar\/edit\//);
  if (!prefixMatch) return resourceUrl;
  const origin = prefixMatch[1];
  const rest = resourceUrl.slice(prefixMatch[0].length);
  const partsMatch = rest.match(/^([A-Za-z0-9+/]*={0,2})/);
  if (!partsMatch) return resourceUrl;
  const rawPath = Buffer.from(partsMatch[1], "base64").toString("utf8");
  const doubleEncoded = rawPath.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  const newBase64 = Buffer.from(doubleEncoded).toString("base64");
  const ts = createdAt ? `/${createdAt}` : "";
  return `${origin}/apps/calendar/dayGridMonth/now/edit/full/${newBase64}${ts}`;
}

function mailApiUrlFrom(resourceUrl: string): string | null {
  // The thread ID in the URL is the databaseId of the message
  const m = resourceUrl.match(/\/apps\/mail\/box\/\d+\/thread\/(\d+)/);
  if (!m) return null;
  const origin = resourceUrl.match(/^(https?:\/\/[^/]+)/)?.[1];
  if (!origin) return null;
  return `${origin}/apps/mail/api/messages/${m[1]}/body`;
}

function parseMailSubline(subline: string): { sender: string; date: string } {
  const idx = subline.lastIndexOf(" \u2013 ");
  if (idx === -1) return { sender: "", date: subline };
  return { sender: subline.slice(0, idx), date: subline.slice(idx + 3) };
}

async function searchProvider(
  baseUrl: string,
  auth: string,
  providerId: string,
  term: string
): Promise<NextcloudEntry[]> {
  const url = `${baseUrl}/ocs/v2.php/search/providers/${providerId}/search?term=${encodeURIComponent(term)}&format=json`;
  const response = await fetch(url, {
    headers: { "OCS-APIRequest": "true", Authorization: `Basic ${auth}` },
  });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`${providerId}: HTTP ${response.status}`);
  }
  const data = (await response.json()) as ProviderSearchResponse;
  return data.ocs.data.entries ?? [];
}

export default function Command({ fallbackText }: LaunchProps) {
  const [searchText, setSearchText] = useState(fallbackText ?? "");
  const [files, setFiles] = useState<NextcloudEntry[]>([]);
  const [contacts, setContacts] = useState<NextcloudEntry[]>([]);
  const [events, setEvents] = useState<NextcloudEntry[]>([]);
  const [mails, setMails] = useState<NextcloudEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [vCards, setVCards] = useState<Record<string, ParsedContact>>({});
  const [loadingVCards, setLoadingVCards] = useState<Set<string>>(new Set());
  const [parsedEvents, setParsedEvents] = useState<Record<string, ParsedEvent>>({});
  const [loadingEvents, setLoadingEvents] = useState<Set<string>>(new Set());
  const [parsedMails, setParsedMails] = useState<Record<string, ParsedMail>>({});
  const [loadingMails, setLoadingMails] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function search() {
      if (!searchText) {
        setFiles([]);
        setContacts([]);
        setEvents([]);
        setMails([]);
        return;
      }
      setIsLoading(true);
      const { url, username, token } = getPreferenceValues<Preferences>();
      const auth = Buffer.from(`${username}:${token}`).toString("base64");
      try {
        const [fileResults, contactResults, eventResults, mailResults] = await Promise.all([
          searchProvider(url, auth, "files", searchText),
          searchProvider(url, auth, "contacts", searchText),
          searchProvider(url, auth, "calendar", searchText),
          searchProvider(url, auth, "mail", searchText),
        ]);
        setFiles(fileResults);
        setContacts(contactResults);
        setEvents(eventResults);
        setMails(mailResults);
      } catch (error) {
        showToast({
          style: Toast.Style.Failure,
          title: "Search Failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsLoading(false);
      }
    }
    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [searchText]);

  function handleSelectionChange(id: string | null) {
    if (!id) return;
    const { token, username } = getPreferenceValues<Preferences>();
    const auth = Buffer.from(`${username}:${token}`).toString("base64");

    // Contacts: lazy vCard fetch
    const contact = contacts.find((c) => c.resourceUrl === id);
    if (contact?.thumbnailUrl && !vCards[id] && !loadingVCards.has(id)) {
      const vcardUrl = vCardUrlFrom(contact.thumbnailUrl);
      if (vcardUrl) {
        setLoadingVCards((prev) => new Set(prev).add(id));
        fetch(vcardUrl, { headers: { Authorization: `Basic ${auth}` } })
          .then((r) => (r.ok ? r.text() : null))
          .then((text) => {
            if (text) setVCards((prev) => ({ ...prev, [id]: parseVCard(text) }));
          })
          .finally(() => setLoadingVCards((prev) => { const n = new Set(prev); n.delete(id); return n; }));
      }
    }

    // Events: lazy ICS fetch
    const event = events.find((e) => e.resourceUrl === id);
    if (event && !parsedEvents[id] && !loadingEvents.has(id)) {
      const icsUrl = calDavUrlFrom(event.resourceUrl);
      if (icsUrl) {
        setLoadingEvents((prev) => new Set(prev).add(id));
        fetch(icsUrl, { headers: { Authorization: `Basic ${auth}` } })
          .then((r) => (r.ok ? r.text() : null))
          .then((text) => {
            if (text) setParsedEvents((prev) => ({ ...prev, [id]: parseICS(text) }));
          })
          .finally(() => setLoadingEvents((prev) => { const n = new Set(prev); n.delete(id); return n; }));
      }
    }

    // Mails: lazy API fetch
    const mail = mails.find((m) => m.resourceUrl === id);
    if (mail && !parsedMails[id] && !loadingMails.has(id)) {
      const apiUrl = mailApiUrlFrom(mail.resourceUrl);
      if (apiUrl) {
        setLoadingMails((prev) => new Set(prev).add(id));
        const origin = mail.resourceUrl.match(/^(https?:\/\/[^/]+)/)?.[1] ?? "";
        const headers = { Authorization: `Basic ${auth}`, "OCS-APIRequest": "true" };
        fetch(apiUrl, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return;
            const rawBody: string = data.body ?? "";
            let bodyMarkdown: string | undefined;
            if (rawBody) {
              bodyMarkdown = rawBody
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>/gi, "\n\n")
                .replace(/<\/div>/gi, "\n")
                .replace(/<\/li>/gi, "\n")
                .replace(/<li[^>]*>/gi, "- ")
                .replace(/<[^>]+>/g, "")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
            }
            setParsedMails((prev) => ({
              ...prev,
              [id]: {
                from: data.from ?? [],
                to: data.to ?? [],
                cc: data.cc ?? [],
                hasAttachments: data.flags?.hasAttachments ?? false,
                seen: data.flags?.seen ?? true,
                subject: data.subject || undefined,
                bodyMarkdown: bodyMarkdown || undefined,
                previewText: undefined,
              },
            }));
          })
          .finally(() => setLoadingMails((prev) => { const n = new Set(prev); n.delete(id); return n; }));
      }
    }
  }

  const isEmpty = files.length === 0 && contacts.length === 0 && events.length === 0 && mails.length === 0;

  return (
    <List
      filtering={false}
      onSearchTextChange={setSearchText}
      onSelectionChange={handleSelectionChange}
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search Nextcloud files, contacts, events and mail..."
    >
      {isEmpty && !isLoading && (
        <List.EmptyView title="No results found" description="Try searching for something else" />
      )}

      {files.length > 0 && (
        <List.Section title="Files">
          {files.map((item, index) => (
            <List.Item
              key={item.resourceUrl || `file-${index}`}
              id={item.resourceUrl}
              title={item.title}
              icon={item.icon || "command-icon.png"}
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      {item.attributes?.path && (
                        <List.Item.Detail.Metadata.Label title="Path" text={item.attributes.path} />
                      )}
                      {item.attributes?.mimetype && (
                        <List.Item.Detail.Metadata.Label title="Type" text={item.attributes.mimetype} />
                      )}
                      {item.subline && (
                        <List.Item.Detail.Metadata.Label title="Info" text={item.subline} />
                      )}
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser url={item.resourceUrl} />
                  <Action.CopyToClipboard content={item.resourceUrl} title="Copy Link" />
                  {item.attributes?.path && (
                    <Action.CopyToClipboard content={item.attributes.path} title="Copy Path" />
                  )}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {contacts.length > 0 && (
        <List.Section title="Contacts">
          {contacts.map((item, index) => {
            const vcard = vCards[item.resourceUrl];
            const isLoadingVCard = loadingVCards.has(item.resourceUrl);
            const emails = vcard?.emails.length ? vcard.emails : item.attributes?.email ? [item.attributes.email] : [];
            const phones = vcard?.phones.length ? vcard.phones : item.attributes?.phoneNumber ? [item.attributes.phoneNumber] : [];
            const openUrl = contactUrlFrom(item);
            return (
              <List.Item
                key={item.resourceUrl || `contact-${index}`}
                id={item.resourceUrl}
                title={item.title}
                icon={item.icon || "command-icon.png"}
                detail={
                  <List.Item.Detail
                    isLoading={isLoadingVCard}
                    metadata={
                      <List.Item.Detail.Metadata>
                        {emails.map((email) => (
                          <List.Item.Detail.Metadata.Link key={email} title="Email" target={`mailto:${email}`} text={email} />
                        ))}
                        {phones.map((phone) => (
                          <List.Item.Detail.Metadata.Label key={phone} title="Phone" text={phone} />
                        ))}
                        {vcard?.org && <List.Item.Detail.Metadata.Label title="Organization" text={vcard.org} />}
                        {vcard?.jobTitle && <List.Item.Detail.Metadata.Label title="Job Title" text={vcard.jobTitle} />}
                        {vcard?.birthday && <List.Item.Detail.Metadata.Label title="Birthday" text={vcard.birthday} />}
                        {vcard?.website && (
                          <List.Item.Detail.Metadata.Link title="Website" target={vcard.website} text={vcard.website} />
                        )}
                        {(vcard?.addresses ?? []).map((adr, i) => (
                          <List.Item.Detail.Metadata.Label key={i} title="Address" text={adr.replace(/;+/g, ", ").replace(/^,\s*|,\s*$/g, "")} />
                        ))}
                        {vcard?.note && (
                          <>
                            <List.Item.Detail.Metadata.Separator />
                            <List.Item.Detail.Metadata.Label title="Note" text={vcard.note} />
                          </>
                        )}
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.OpenInBrowser url={openUrl} />
                    {emails.map((email) => (
                      <Action.CopyToClipboard key={email} content={email} title={`Copy Email: ${email}`} />
                    ))}
                    {phones.map((phone) => (
                      <Action.CopyToClipboard key={phone} content={phone} title={`Copy Phone: ${phone}`} />
                    ))}
                    {vcard?.org && <Action.CopyToClipboard content={vcard.org} title={`Copy Organization: ${vcard.org}`} />}
                    {vcard?.jobTitle && <Action.CopyToClipboard content={vcard.jobTitle} title={`Copy Job Title: ${vcard.jobTitle}`} />}
                    {(vcard?.addresses ?? []).map((adr) => (
                      <Action.CopyToClipboard key={adr} content={adr} title={`Copy Address: ${adr}`} />
                    ))}
                    {vcard?.website && <Action.CopyToClipboard content={vcard.website} title={`Copy Website: ${vcard.website}`} />}
                    {vcard?.birthday && <Action.CopyToClipboard content={vcard.birthday} title={`Copy Birthday: ${vcard.birthday}`} />}
                    {vcard?.note && <Action.CopyToClipboard content={vcard.note} title="Copy Note" />}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      {events.length > 0 && (
        <List.Section title="Events">
          {events.map((item, index) => {
            const ev = parsedEvents[item.resourceUrl];
            const isLoadingEvent = loadingEvents.has(item.resourceUrl);
            return (
              <List.Item
                key={item.resourceUrl || `event-${index}`}
                id={item.resourceUrl}
                title={item.title}
                icon={item.icon || "command-icon.png"}
                detail={
                  <List.Item.Detail
                    isLoading={isLoadingEvent}
                    metadata={
                      <List.Item.Detail.Metadata>
                        {item.subline && <List.Item.Detail.Metadata.Label title="When" text={item.subline} />}
                        {ev?.location && <List.Item.Detail.Metadata.Label title="Location" text={ev.location} />}
                        {ev?.organizer && <List.Item.Detail.Metadata.Label title="Organizer" text={ev.organizer} />}
                        {ev?.status && <List.Item.Detail.Metadata.Label title="Status" text={ev.status} />}
                        {ev?.description && (
                          <>
                            <List.Item.Detail.Metadata.Separator />
                            <List.Item.Detail.Metadata.Label title="Description" text={ev.description} />
                          </>
                        )}
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.OpenInBrowser url={calendarAppUrlFrom(item.resourceUrl, item.attributes?.createdAt)} />
                    <Action.CopyToClipboard content={item.title} title="Copy Title" />
                    {item.subline && <Action.CopyToClipboard content={item.subline} title="Copy Date" />}
                    {ev?.location && <Action.CopyToClipboard content={ev.location} title="Copy Location" />}
                    {ev?.description && <Action.CopyToClipboard content={ev.description} title="Copy Description" />}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      {mails.length > 0 && (
        <List.Section title="Mails">
          {mails.map((item, index) => {
            const mail = parsedMails[item.resourceUrl];
            const isLoadingMail = loadingMails.has(item.resourceUrl);
            const { sender, date } = parseMailSubline(item.subline);
            const formatAddresses = (addrs: MailAddress[]) =>
              addrs.map((a) => (a.label && a.label !== a.email ? `${a.label} <${a.email}>` : a.email)).join(", ");
            return (
              <List.Item
                key={item.resourceUrl || `mail-${index}`}
                id={item.resourceUrl}
                title={item.title}
                icon={item.icon || "command-icon.png"}
                detail={
                  <List.Item.Detail
                    isLoading={isLoadingMail}
                    markdown={mail?.bodyMarkdown ?? (mail ? undefined : undefined)}
                    metadata={
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label title="Subject" text={item.title} />
                        {mail ? (
                          <>
                            {mail.from.length > 0 && (
                              <List.Item.Detail.Metadata.Label title="From" text={formatAddresses(mail.from)} />
                            )}
                            {mail.to.length > 0 && (
                              <List.Item.Detail.Metadata.Label title="To" text={formatAddresses(mail.to)} />
                            )}
                            {mail.cc.length > 0 && (
                              <List.Item.Detail.Metadata.Label title="CC" text={formatAddresses(mail.cc)} />
                            )}
                            <List.Item.Detail.Metadata.Label title="Date" text={date} />
                            {mail.hasAttachments && (
                              <List.Item.Detail.Metadata.Label title="Attachments" text="Yes" />
                            )}
                            {!mail.bodyMarkdown && mail.previewText && (
                              <>
                                <List.Item.Detail.Metadata.Separator />
                                <List.Item.Detail.Metadata.Label title="Preview" text={mail.previewText} />
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {sender && <List.Item.Detail.Metadata.Label title="From" text={sender} />}
                            {date && <List.Item.Detail.Metadata.Label title="Date" text={date} />}
                          </>
                        )}
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.OpenInBrowser url={item.resourceUrl} />
                    <Action.CopyToClipboard content={item.title} title="Copy Subject" />
                    {mail?.from.length
                      ? mail.from.map((a) => (
                          <Action.CopyToClipboard key={a.email} content={a.email} title={`Copy Sender: ${a.email}`} />
                        ))
                      : sender && <Action.CopyToClipboard content={sender} title="Copy Sender" />}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
