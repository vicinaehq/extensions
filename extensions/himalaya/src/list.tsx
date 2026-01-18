import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
  Cache,
} from "@vicinae/api";
import { Himalaya, Email } from "./himalaya";

const cache = new Cache();
const CACHE_TTL_MS = 300000; // 5 minutes

function getCachedData(key: string, ttlMs: number = CACHE_TTL_MS) {
  const stored = cache.get(key);
  if (!stored) return null;
  try {
    const data = JSON.parse(stored);
    if (Date.now() - data.timestamp > ttlMs) return null;
    return data.value;
  } catch {
    return null;
  }
}

function setCachedData(key: string, value: any) {
  cache.set(key, JSON.stringify({ value, timestamp: Date.now() }));
}

async function deleteEmail(emailId: string, folder: string, onSuccess: () => void, onError: (error: any) => void) {
  try {
    await Himalaya.deleteEmail(emailId, folder);
    showToast({ title: "Email deleted" });
    onSuccess();
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to delete email",
    });
    onError(error);
  }
}

function useCachedAsyncData<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  deps: any[] = []
): { data: T | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const cached = getCachedData(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    const result = await fetchFn();
    setCachedData(cacheKey, result);
    setData(result);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, deps);

  return { data, loading, refetch: fetchData };
}

function useEmails(folder: string) {
  const { data: emails, loading, refetch } = useCachedAsyncData<Email[]>(
    `himalaya_emails_${folder}`,
    () => Himalaya.listEmails(folder),
    [folder]
  );
  return { emails: emails || [], loading, refetch };
}

function useFolders() {
  const { data: folders, loading } = useCachedAsyncData<string[]>(
    'himalaya_folders',
    () => Himalaya.listFolders(),
    []
  );
  return { folders: folders || [], loading };
}

function EmailView({ email, folder }: { email: Email; folder: string }) {
  const { pop } = useNavigation();
  const { data: content, loading } = useCachedAsyncData<string>(
    `himalaya_email_${folder}_${email.id}`,
    () => Himalaya.readEmail(email.id, folder),
    [email.id, folder]
  );

  if (loading || !content) {
    return null;
  }

  return (
    <Detail
      markdown={content}
      actions={
        <ActionPanel>
          <Action
            title="Delete Email"
            style="destructive"
            shortcut={{ modifiers: ["ctrl"], key: "delete" }}
            onAction={() => deleteEmail(email.id, folder, () => pop(), () => {})}
          />
        </ActionPanel>
      }
    />
  );
}

function ListEmails() {
  const [selectedFolder, setSelectedFolder] = useState<string>("INBOX");
  const { emails, loading, refetch } = useEmails(selectedFolder);
  const { folders, loading: foldersLoading } = useFolders();
  const { push } = useNavigation();

  // Set initial folder to first available folder when folders load
  useEffect(() => {
    if (folders.length > 0 && !folders.includes(selectedFolder)) {
      setSelectedFolder(folders[0]);
    }
  }, [folders, selectedFolder]);

  if (emails.length === 0 && !loading) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Envelope}
          title="No Emails"
          description="Your inbox is empty."
          actions={
            <ActionPanel>
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                onAction={refetch}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search emails..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Select Folder"
          value={selectedFolder}
          onChange={(newValue) => {
            setSelectedFolder(newValue);
          }}
        >
          {foldersLoading ? (
            <List.Dropdown.Item
              key="loading"
              title="Loading folders..."
              value=""
            />
          ) : folders.length > 0 ? (
            folders.map((folder) => (
              <List.Dropdown.Item
                key={folder}
                title={folder}
                value={folder}
              />
            ))
          ) : (
            <List.Dropdown.Item
              key="no-folders"
              title="No folders found"
              value=""
            />
          )}
        </List.Dropdown>
      }
    >
      {emails.map((email) => (
        <List.Item
          key={email.id}
          title={email.subject}
          subtitle={email.from.name ? `${email.from.name} <${email.from.addr}>` : email.from.addr}
          accessories={[
            { text: email.date },
            ...(email.hasAttachments ? [{ text: "has attachments" }] : []),
            ...( !email.flags.includes("Seen") ? [{ icon: Icon.Dot }] : []),
          ]}
          actions={
            <ActionPanel>
              <Action
                title="View Email"
                icon={Icon.Eye}
                onAction={() => push(<EmailView email={email} folder={selectedFolder} />)}
              />
              <Action
                title="Delete Email"
                icon={Icon.Trash}
                style="destructive"
                shortcut={{ modifiers: ["ctrl"], key: "delete" }}
                onAction={() => deleteEmail(email.id, selectedFolder, refetch, () => {})}
              />
              <ActionPanel.Section>
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["ctrl"], key: "r" }}
                  onAction={refetch}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export default function Command() {
  return <ListEmails />;
}
