import {
  Action,
  ActionPanel,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { accountAccessories } from "./features/inbox/account-accessories";
import {
  ALL_INBOXES,
  findArchiveMailbox,
  mailboxValue,
} from "./features/inbox/mailbox-helpers";
import { useInbox } from "./features/inbox/use-inbox";
import { detectEmailAppTarget, type EmailAppTarget } from "./features/messages/default-email-app";
import { MessageActions } from "./features/messages/message-actions";
import type { Preferences } from "./types";

export default function Inbox() {
  const preferences = getPreferenceValues<Preferences>();
  const [emailAppTarget, setEmailAppTarget] = useState<EmailAppTarget>("default");
  const displayedError = useRef<string | undefined>(undefined);
  const archivingMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    void detectEmailAppTarget().then(setEmailAppTarget);
  }, []);
  const {
    accounts,
    accountsById,
    error,
    isLoading,
    load,
    mailboxes,
    messages,
    reload,
    removeMessage,
    searchScope,
    searchText,
    selectMailbox,
    selectedMailbox,
    selectedTitle,
    setSearchScope,
    setSearchText,
    updateReadState,
  } = useInbox(preferences);
  const isRemoteSearch = searchScope === "remote" && Boolean(searchText.trim());
  const isInitialLoading = isLoading && messages.length === 0;

  useEffect(() => {
    if (!error || messages.length === 0 || displayedError.current === error) return;
    displayedError.current = error;
    void showToast({
      style: Toast.Style.Failure,
      title: "Some accounts could not be loaded",
      message: error.replace(/\n/g, " "),
    });
  }, [error, messages.length]);

  useEffect(() => {
    if (!error) displayedError.current = undefined;
  }, [error]);
  const maxMessageSizeMb = Number(preferences.messageDownloadLimitMb) || 10;

  return (
    <List
      isLoading={isLoading}
      navigationTitle={isInitialLoading ? "Loading Inbox…" : "Inbox"}
      filtering={searchScope === "current"}
      throttle={searchScope === "remote"}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={isInitialLoading
        ? "Loading messages…"
        : searchScope === "remote"
          ? `Search all of ${selectedTitle}...`
          : `Filter ${selectedTitle}...`}
      searchBarAccessory={
        <List.Dropdown
          tooltip={`Search: ${searchScope === "remote" ? "All Mail" : "Current List"} · Mailbox: ${selectedTitle}`}
          value={`mailbox:${selectedMailbox}`}
          onChange={(value) => {
            if (value === "scope:current" || value === "scope:remote") {
              setSearchScope(value === "scope:remote" ? "remote" : "current");
              return;
            }
            if (value.startsWith("mailbox:")) void selectMailbox(value.slice("mailbox:".length));
          }}
        >
          <List.Dropdown.Section title="Search Scope">
            <List.Dropdown.Item
              title={`${searchScope === "current" ? "✓ " : ""}Current List`}
              value="scope:current"
              icon={Icon.MagnifyingGlass}
            />
            <List.Dropdown.Item
              title={`${searchScope === "remote" ? "✓ " : ""}All Mail`}
              value="scope:remote"
              icon={Icon.Globe01}
            />
          </List.Dropdown.Section>
          <List.Dropdown.Section title="Mailbox">
            <List.Dropdown.Item
              title="All Inboxes"
              value={`mailbox:${ALL_INBOXES}`}
              icon={Icon.Envelope}
            />
          </List.Dropdown.Section>
          {accounts.map((account) => (
            <List.Dropdown.Section
              key={account.id}
              title={`${account.name} (${account.email})`}
            >
              {mailboxes
                .filter((mailbox) => mailbox.accountId === account.id)
                .map((mailbox) => (
                  <List.Dropdown.Item
                    key={mailboxValue(mailbox)}
                    title={mailbox.name}
                    value={`mailbox:${mailboxValue(mailbox)}`}
                    icon={
                      mailbox.specialUse === "\\Inbox"
                        ? Icon.Envelope
                        : Icon.Folder
                    }
                  />
                ))}
            </List.Dropdown.Section>
          ))}
        </List.Dropdown>
      }
    >
      {!isLoading && accounts.length === 0 ? (
        <List.EmptyView
          title="No mail-enabled accounts"
          description="Add an account or enable Mail in GNOME Settings → Online Accounts."
          icon={Icon.Envelope}
        />
      ) : !isLoading && messages.length === 0 ? (
        <List.EmptyView
          title={error ? (isRemoteSearch ? "Could not search mailbox" : "Could not load mailbox") : isRemoteSearch ? "No matching messages" : `${selectedTitle} is empty`}
          description={error ?? (isRemoteSearch ? "Try a different search term or switch to Current List." : undefined)}
          icon={error ? Icon.Exclamationmark : Icon.Envelope}
          actions={
            <ActionPanel>
              <Action
                title="Reload list"
                icon={Icon.ArrowClockwise}
                onAction={isRemoteSearch ? reload : load}
              />
            </ActionPanel>
          }
        />
      ) : null}
      {messages.map((message) => {
        const account = accountsById.get(message.accountId);
        if (!account) return null;
        const archiveMailbox = findArchiveMailbox(mailboxes, account.id);
        return (
          <List.Item
            key={message.id}
            id={message.id}
            icon={message.unread ? Icon.Envelope : Icon.CheckCircle}
            title={message.subject}
            subtitle={message.from}
            accessories={[
              ...(message.attachments.length
                ? [{ tag: String(message.attachments.length), icon: Icon.Paperclip, tooltip: `${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}` }]
                : []),
              ...accountAccessories(account, preferences.showFavicons),
              ...(message.date
                ? [
                    {
                      text: message.date.toLocaleDateString(),
                      tooltip: message.mailboxPath,
                    },
                  ]
                : []),
            ]}
            actions={
              <MessageActions
                account={account}
                message={message}
                showImages={preferences.showImages}
                maxMessageSizeMb={maxMessageSizeMb}
                emailAppTarget={emailAppTarget}
                readOnlyMode={preferences.readOnlyMode}
                onReadStateChange={(unread) => {
                  updateReadState(message.id, unread);
                }}
                archiveMailboxPath={
                  archiveMailbox?.path === message.mailboxPath
                    ? undefined
                    : archiveMailbox?.path
                }
                onArchiveStart={() => {
                  if (archivingMessage.current) return false;
                  archivingMessage.current = message.id;
                  return true;
                }}
                onArchiveEnd={() => {
                  if (archivingMessage.current === message.id) archivingMessage.current = undefined;
                }}
                onArchived={() => {
                  removeMessage(message.id);
                }}
                onReload={() => {
                  void reload();
                }}
              />
            }
          />
        );
      })}
    </List>
  );
}
