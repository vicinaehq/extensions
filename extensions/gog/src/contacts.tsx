import { useState, useEffect, useCallback } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  useNavigation,
  Form,
} from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "util";
import { ensureGogInstalled, useGogAccounts } from "./utils";

const execAsync = promisify(exec);

interface Contact {
  resource: string;
  name: string;
  phone?: string;
  email?: string;
  organization?: string;
  title?: string;
  photoUrl?: string;
}

interface ContactDetail {
  contact: {
    resourceName: string;
    etag: string;
    names?: { displayName: string; givenName?: string; familyName?: string }[];
    emailAddresses?: { value: string; type?: string }[];
    phoneNumbers?: { value: string; type?: string }[];
    organizations?: { name?: string; title?: string }[];
    addresses?: { formattedValue?: string; type?: string }[];
    birthdays?: { date?: { year?: number; month?: number; day?: number } }[];
  };
}

interface ContactsListResponse {
  contacts: Contact[];
  nextPageToken?: string;
}

const SOURCE_FILTERS = [
  { value: "contacts", title: "My Contacts" },
  { value: "directory", title: "Directory" },
  { value: "search", title: "Search" },
];

interface CreateContactFormProps {
  account: string;
  onComplete: () => void;
}

function CreateContactForm({ account, onComplete }: CreateContactFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Plus}
            title="Create Contact"
            onSubmit={async (values) => {
              try {
                const {
                  givenName,
                  familyName,
                  email,
                  phone,
                  organization,
                  title,
                } = values as {
                  givenName: string;
                  familyName?: string;
                  email?: string;
                  phone?: string;
                  organization?: string;
                  title?: string;
                };
                let cmd = `gog contacts create --account "${account}" --given "${givenName}"`;
                if (familyName) cmd += ` --family "${familyName}"`;
                if (email) cmd += ` --email "${email}"`;
                if (phone) cmd += ` --phone "${phone}"`;
                if (organization) cmd += ` --organization "${organization}"`;
                if (title) cmd += ` --title "${title}"`;
                await execAsync(cmd);
                showToast({ title: "Contact created" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to create contact",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="givenName" title="First Name" />
      <Form.TextField id="familyName" title="Last Name" />
      <Form.TextField id="email" title="Email" />
      <Form.TextField id="phone" title="Phone" />
      <Form.TextField id="organization" title="Company" />
      <Form.TextField id="title" title="Job Title" />
    </Form>
  );
}

interface UpdateContactFormProps {
  account: string;
  contact: Contact;
  detail: ContactDetail | null;
  onComplete: () => void;
}

function UpdateContactForm({
  account,
  contact,
  detail,
  onComplete,
}: UpdateContactFormProps) {
  const { pop } = useNavigation();
  const c = detail?.contact;
  const name = c?.names?.[0];
  const email = c?.emailAddresses?.[0]?.value || contact.email;
  const phone = c?.phoneNumbers?.[0]?.value || contact.phone;

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Check}
            title="Update Contact"
            onSubmit={async (values) => {
              try {
                const { givenName, familyName, newEmail, newPhone } =
                  values as {
                    givenName: string;
                    familyName?: string;
                    newEmail?: string;
                    newPhone?: string;
                  };
                let cmd = `gog contacts update --account "${account}" "${contact.resource}"`;
                cmd += ` --given "${givenName}"`;
                if (familyName) cmd += ` --family "${familyName}"`;
                if (newEmail) cmd += ` --email "${newEmail}"`;
                if (newPhone) cmd += ` --phone "${newPhone}"`;
                await execAsync(cmd);
                showToast({ title: "Contact updated" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to update contact",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="givenName"
        title="First Name"
        defaultValue={name?.givenName || ""}
      />
      <Form.TextField
        id="familyName"
        title="Last Name"
        defaultValue={name?.familyName || ""}
      />
      <Form.TextField id="newEmail" title="Email" defaultValue={email || ""} />
      <Form.TextField id="newPhone" title="Phone" defaultValue={phone || ""} />
    </Form>
  );
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [source, setSource] = useState("contacts");
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contactDetails, setContactDetails] = useState<
    Record<string, ContactDetail>
  >({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>(
    {},
  );
  const [account, setAccount] = useState<string>("");
  const { accounts } = useGogAccounts();
  const { push } = useNavigation();

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !account) {
      setAccount(accounts[0]?.email || "");
    }
  }, [accounts, account]);

  const loadContacts = useCallback(async () => {
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }

    if (!account) {
      setIsLoading(false);
      return;
    }

    // For search mode, don't load anything initially
    if (source === "search" && !searchText.trim()) {
      setContacts([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const accountArg = `--account "${account}"`;
      let cmd: string;
      if (source === "search" && searchText.trim()) {
        cmd = `gog contacts search "${searchText}" ${accountArg} --max 50 --json`;
      } else if (source === "directory") {
        cmd = `gog contacts directory list ${accountArg} --max 100 --json`;
      } else {
        cmd = `gog contacts list ${accountArg} --max 100 --json`;
      }
      const { stdout } = await execAsync(cmd);
      const data: ContactsListResponse = JSON.parse(stdout);
      setContacts(data.contacts || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Error loading contacts",
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [source, searchText, account]);

  // Debounced search
  useEffect(() => {
    if (source === "search") {
      const timer = setTimeout(() => {
        loadContacts();
      }, 300);
      return () => clearTimeout(timer);
    }
    loadContacts();
    return undefined;
  }, [source, searchText, loadContacts]);

  // Load contact detail when selected
  const loadContactDetail = useCallback(
    async (resource: string) => {
      if (contactDetails[resource] || loadingDetails[resource] || !account)
        return;

      setLoadingDetails((prev) => ({ ...prev, [resource]: true }));
      try {
        const { stdout } = await execAsync(
          `gog contacts get "${resource}" --account "${account}" --json`,
        );
        const detail: ContactDetail = JSON.parse(stdout);
        setContactDetails((prev) => ({ ...prev, [resource]: detail }));
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingDetails((prev) => ({ ...prev, [resource]: false }));
      }
    },
    [contactDetails, loadingDetails, account],
  );

  // Load detail when selection changes
  useEffect(() => {
    if (selectedId) {
      loadContactDetail(selectedId);
    }
  }, [selectedId, loadContactDetail]);

  const deleteContact = async (resource: string) => {
    try {
      await execAsync(
        `gog contacts delete --account "${account}" "${resource}" --force`,
      );
      showToast({ title: "Contact deleted" });
      await loadContacts();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed to delete", style: Toast.Style.Failure });
    }
  };

  const globalActions = (
    <ActionPanel>
      <Action
        icon={Icon.Plus}
        title="Create Contact"
        onAction={() =>
          push(
            <CreateContactForm account={account} onComplete={loadContacts} />,
          )
        }
      />
      <Action
        icon={Icon.RotateClockwise}
        title="Refresh"
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={loadContacts}
      />
    </ActionPanel>
  );

  const emptyViewTitle =
    source === "search"
      ? searchText
        ? "No Results"
        : "Search Contacts"
      : "No Contacts";
  const emptyViewDescription =
    source === "search"
      ? searchText
        ? `No contacts found for "${searchText}"`
        : "Type to search contacts by name, email, or phone"
      : "Create a contact to get started";

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      filtering={source !== "search"}
      searchBarPlaceholder={
        source === "search"
          ? "Search by name, email, or phone..."
          : "Filter contacts..."
      }
      onSearchTextChange={source === "search" ? setSearchText : undefined}
      onSelectionChange={(id) => setSelectedId(id || null)}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Account & Source"
          value={`${account}|${source}`}
          onChange={(value) => {
            const [acc, src] = value.split("|");
            if (acc && src) {
              setAccount(acc);
              setSource(src);
            }
          }}
        >
          {accounts.map((acc) => (
            <List.Dropdown.Section key={acc.email} title={acc.email}>
              {SOURCE_FILTERS.map((f) => (
                <List.Dropdown.Item
                  key={`${acc.email}|${f.value}`}
                  title={f.title}
                  value={`${acc.email}|${f.value}`}
                />
              ))}
            </List.Dropdown.Section>
          ))}
        </List.Dropdown>
      }
      actions={globalActions}
    >
      {!isLoading && contacts.length === 0 ? (
        <List.EmptyView
          title={emptyViewTitle}
          description={emptyViewDescription}
          icon={source === "search" ? Icon.MagnifyingGlass : Icon.Person}
          actions={globalActions}
        />
      ) : (
        contacts.map((contact) => {
          const detail = contactDetails[contact.resource];
          const isLoadingDetail = loadingDetails[contact.resource];
          const c = detail?.contact;
          const emails = c?.emailAddresses || [];
          const phones = c?.phoneNumbers || [];
          const orgs = c?.organizations || [];
          const addresses = c?.addresses || [];
          const birthdays = c?.birthdays || [];
          const primaryEmail = emails[0]?.value || contact.email;
          const primaryPhone = phones[0]?.value || contact.phone;
          const org = orgs[0];
          const birthday = birthdays[0]?.date;

          return (
            <List.Item
              key={contact.resource}
              id={contact.resource}
              title={contact.name}
              subtitle={org?.name || org?.title || ""}
              accessories={[
                ...(primaryEmail
                  ? [{ icon: Icon.Envelope, tooltip: primaryEmail }]
                  : []),
                ...(primaryPhone
                  ? [{ icon: Icon.Phone, tooltip: primaryPhone }]
                  : []),
              ]}
              icon={Icon.Person}
              detail={
                <List.Item.Detail
                  isLoading={isLoadingDetail}
                  markdown={undefined}
                  metadata={
                    <List.Item.Detail.Metadata>
                      {org && (org.name || org.title) && (
                        <>
                          <List.Item.Detail.Metadata.Label
                            title="Organization"
                            text={
                              org.title && org.name
                                ? `${org.title} at ${org.name}`
                                : org.name || org.title || ""
                            }
                          />
                          <List.Item.Detail.Metadata.Separator />
                        </>
                      )}
                      {emails.length > 0 && (
                        <>
                          {emails.map((e, i) => (
                            <List.Item.Detail.Metadata.Link
                              key={`email-${i}`}
                              title={e.type || "Email"}
                              text={e.value}
                              target={`mailto:${e.value}`}
                            />
                          ))}
                          <List.Item.Detail.Metadata.Separator />
                        </>
                      )}
                      {phones.length > 0 && (
                        <>
                          {phones.map((p, i) => (
                            <List.Item.Detail.Metadata.Label
                              key={`phone-${i}`}
                              title={p.type || "Phone"}
                              text={p.value}
                            />
                          ))}
                          <List.Item.Detail.Metadata.Separator />
                        </>
                      )}
                      {addresses.filter((a) => a.formattedValue).length > 0 && (
                        <>
                          {addresses
                            .filter((a) => a.formattedValue)
                            .map((a, i) => (
                              <List.Item.Detail.Metadata.Label
                                key={`addr-${i}`}
                                title={a.type || "Address"}
                                text={a.formattedValue!}
                              />
                            ))}
                          <List.Item.Detail.Metadata.Separator />
                        </>
                      )}
                      {birthday && (
                        <List.Item.Detail.Metadata.Label
                          title="Birthday"
                          text={`${birthday.month}/${birthday.day}${birthday.year ? `/${birthday.year}` : ""}`}
                        />
                      )}
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    {primaryEmail && (
                      <Action.OpenInBrowser
                        icon={Icon.Envelope}
                        title="Send Email"
                        url={`mailto:${primaryEmail}`}
                      />
                    )}
                    {primaryEmail && (
                      <Action.CopyToClipboard
                        icon={Icon.CopyClipboard}
                        title="Copy Email"
                        content={primaryEmail}
                      />
                    )}
                    {primaryPhone && (
                      <Action.CopyToClipboard
                        icon={Icon.CopyClipboard}
                        title="Copy Phone"
                        content={primaryPhone}
                      />
                    )}
                  </ActionPanel.Section>
                  <ActionPanel.Section title="Manage">
                    <Action
                      icon={Icon.Pencil}
                      title="Edit Contact"
                      onAction={() =>
                        push(
                          <UpdateContactForm
                            account={account}
                            contact={contact}
                            detail={detail || null}
                            onComplete={loadContacts}
                          />,
                        )
                      }
                    />
                    <Action
                      icon={Icon.Trash}
                      title="Delete Contact"
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["shift"], key: "delete" }}
                      onAction={() => deleteContact(contact.resource)}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action
                      icon={Icon.Plus}
                      title="Create Contact"
                      onAction={() =>
                        push(
                          <CreateContactForm
                            account={account}
                            onComplete={loadContacts}
                          />,
                        )
                      }
                    />
                    <Action
                      icon={Icon.RotateClockwise}
                      title="Refresh"
                      shortcut={{ modifiers: ["ctrl"], key: "r" }}
                      onAction={loadContacts}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
