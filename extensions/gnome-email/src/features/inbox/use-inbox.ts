import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMailAccounts } from "../../goa";
import { errorMessage } from "../../lib/errors";
import { fetchInbox, fetchMailbox, getMailboxes, searchMailbox } from "./mailbox-service";
import type { EmailMessage, GoaMailAccount, Mailbox, Preferences } from "../../types";
import { cleanupMessageImageCache } from "../messages/image-cache";
import { clearInboxCache, loadInboxCache, saveInboxCache } from "./inbox-cache";
import { ALL_INBOXES, mailboxValue } from "./mailbox-helpers";

export type SearchScope = "current" | "remote";

export function useInbox(preferences: Preferences) {
  const { readOnlyMode } = preferences;
  const initialCache = useMemo(loadInboxCache, []);
  const hasUsableCache = Boolean(initialCache?.accounts.length && initialCache.messages.length);
  const [accounts, setAccounts] = useState<GoaMailAccount[]>(initialCache?.accounts ?? []);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(initialCache?.mailboxes ?? []);
  const [messages, setMessages] = useState<EmailMessage[]>(initialCache?.messages ?? []);
  const [selectedMailbox, setSelectedMailbox] = useState(ALL_INBOXES);
  const [searchScope, setSearchScope] = useState<SearchScope>("current");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<EmailMessage[]>();
  const [searchError, setSearchError] = useState<string>();
  const [searchRevision, setSearchRevision] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasUsableCache);
  const [error, setError] = useState<string>();
  const searchRequest = useRef(0);
  const accountsRef = useRef(accounts);
  const mailboxesRef = useRef(mailboxes);
  const selectedMailboxRef = useRef(selectedMailbox);
  const allInboxMessagesRef = useRef(initialCache?.messages ?? []);

  const sortedMessages = useCallback((loaded: EmailMessage[]) =>
    loaded.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)), []);

  const setAccountState = useCallback((nextAccounts: GoaMailAccount[], nextMailboxes: Mailbox[]) => {
    accountsRef.current = nextAccounts;
    mailboxesRef.current = nextMailboxes;
    setAccounts(nextAccounts);
    setMailboxes(nextMailboxes);
  }, []);

  const setAllInboxMessages = useCallback((loaded: EmailMessage[], display = true) => {
    const sorted = sortedMessages(loaded);
    allInboxMessagesRef.current = sorted;
    if (display) setMessages(sorted);
    saveInboxCache({ accounts: accountsRef.current, mailboxes: mailboxesRef.current, messages: sorted });
  }, [sortedMessages]);

  const load = useCallback(async (background = false) => {
    if (!background) setIsLoading(true);
    setError(undefined);

    try {
      const discovered = await getMailAccounts();
      if (!discovered.length) {
        setAccountState([], []);
        allInboxMessagesRef.current = [];
        setMessages([]);
        clearInboxCache();
        return;
      }

      accountsRef.current = discovered;
      setAccounts(discovered);

      const [inboxResults, mailboxResults] = await Promise.all([
        Promise.allSettled(discovered.map((account) => fetchInbox(account, readOnlyMode))),
        Promise.allSettled(discovered.map((account) => getMailboxes(account))),
      ]);

      const refreshedMessages = inboxResults.flatMap((result, index) =>
        result.status === "fulfilled"
          ? result.value
          : allInboxMessagesRef.current.filter((message) => message.accountId === discovered[index].id),
      );
      const refreshedMailboxes = mailboxResults.flatMap((result, index) =>
        result.status === "fulfilled"
          ? result.value
          : mailboxesRef.current.filter((mailbox) => mailbox.accountId === discovered[index].id),
      );
      setAccountState(discovered, refreshedMailboxes);
      setAllInboxMessages(refreshedMessages, selectedMailboxRef.current === ALL_INBOXES);

      const failures = inboxResults.flatMap((result, index) =>
        result.status === "rejected" ? [`${discovered[index].name}: ${errorMessage(result.reason)}`] : [],
      );
      if (failures.length) setError(failures.join("\n"));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      if (!background) setIsLoading(false);
    }
  }, [readOnlyMode, setAccountState, setAllInboxMessages]);

  useEffect(() => { void cleanupMessageImageCache(); }, []);
  useEffect(() => { void load(hasUsableCache); }, [hasUsableCache, load]);

  const selectMailbox = useCallback(async (value: string) => {
    selectedMailboxRef.current = value;
    setSelectedMailbox(value);
    setIsLoading(true);
    setError(undefined);

    try {
      if (value === ALL_INBOXES) {
        const results = await Promise.allSettled(
          accounts.map((account) => fetchInbox(account, readOnlyMode))
        );

        setAllInboxMessages(results.flatMap((result, index) =>
          result.status === "fulfilled"
            ? result.value
            : allInboxMessagesRef.current.filter((message) => message.accountId === accounts[index].id),
        ));

        const failures = results.flatMap((result, index) =>
          result.status === "rejected" ? [`${accounts[index].name}: ${errorMessage(result.reason)}`] : [],
        );

        if (failures.length) setError(failures.join("\n"));
        return;
      }

      const mailbox = mailboxes.find((candidate) => mailboxValue(candidate) === value);
      const account = accounts.find((candidate) => candidate.id === mailbox?.accountId);

      if (!mailbox || !account) throw new Error("The selected mailbox is no longer available");
      setMessages(sortedMessages(await fetchMailbox(account, mailbox.path, readOnlyMode)));
    } catch (cause) {
      setMessages([]);
      setError(errorMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, [accounts, mailboxes, readOnlyMode, setAllInboxMessages, sortedMessages]);

  useEffect(() => {
    const query = searchText.trim();
    if (searchScope !== "remote" || !query) {
      searchRequest.current += 1;
      setSearchResults(undefined);
      setSearchError(undefined);
      setIsSearching(false);
      return;
    }

    const request = ++searchRequest.current;
    setIsSearching(true);
    setSearchError(undefined);

    const search = async () => {
      try {
        let results: EmailMessage[];
        if (selectedMailbox === ALL_INBOXES) {
          const settled = await Promise.allSettled(accounts.map((account) => searchMailbox(account, "INBOX", query)));
          results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
          const failures = settled.flatMap((result, index) =>
            result.status === "rejected" ? [`${accounts[index].name}: ${errorMessage(result.reason)}`] : [],
          );
          if (request === searchRequest.current && failures.length) setSearchError(failures.join("\n"));
        } else {
          const mailbox = mailboxes.find((candidate) => mailboxValue(candidate) === selectedMailbox);
          const account = accounts.find((candidate) => candidate.id === mailbox?.accountId);
          if (!mailbox || !account) throw new Error("The selected mailbox is no longer available");
          results = await searchMailbox(account, mailbox.path, query);
        }

        if (request === searchRequest.current) {
          setSearchResults(results
            .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
            .slice(0, 100));
        }
      } catch (cause) {
        if (request === searchRequest.current) {
          setSearchResults([]);
          setSearchError(errorMessage(cause));
        }
      } finally {
        if (request === searchRequest.current) setIsSearching(false);
      }
    };

    void search();
    return () => { searchRequest.current += 1; };
  }, [accounts, mailboxes, searchRevision, searchScope, searchText, selectedMailbox]);

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const selectedTitle = selectedMailbox === ALL_INBOXES
    ? "All Inboxes"
    : mailboxes.find((mailbox) => mailboxValue(mailbox) === selectedMailbox)?.name ?? "Mailbox";

  const persistCachedMessages = useCallback((nextMessages: EmailMessage[]) => {
    allInboxMessagesRef.current = nextMessages;
    saveInboxCache({ accounts: accountsRef.current, mailboxes: mailboxesRef.current, messages: nextMessages });
  }, []);

  const updateReadState = useCallback((messageId: string, unread: boolean) => {
    const update = (current: EmailMessage[]) => current.map((message) => message.id === messageId ? { ...message, unread } : message);
    setMessages(update);
    setSearchResults((current) => current ? update(current) : current);
    persistCachedMessages(update(allInboxMessagesRef.current));
  }, [persistCachedMessages]);

  const removeMessage = useCallback((messageId: string) => {
    const remove = (current: EmailMessage[]) => current.filter((message) => message.id !== messageId);
    setMessages(remove);
    setSearchResults((current) => current ? remove(current) : current);
    persistCachedMessages(remove(allInboxMessagesRef.current));
  }, [persistCachedMessages]);

  const reload = useCallback(async () => {
    await selectMailbox(selectedMailbox);
    if (searchScope === "remote" && searchText.trim()) setSearchRevision((current) => current + 1);
  }, [searchScope, searchText, selectMailbox, selectedMailbox]);
  const displayedMessages = searchScope === "remote" && searchText.trim()
    ? searchResults ?? []
    : messages;

  return {
    accounts,
    accountsById,
    error: searchError ?? error,
    isLoading: isLoading || isSearching,
    load,
    mailboxes,
    messages: displayedMessages,
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
  };
}
