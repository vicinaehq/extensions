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
  open,
} from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { join } from "path";
import { ensureGogInstalled, useGogAccounts } from "./utils";

const execAsync = promisify(exec);
const DOWNLOADS_DIR = join(homedir(), ".config/gogcli/drive-downloads");

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  size?: string;
  shared?: boolean;
  starred?: boolean;
  trashed?: boolean;
  ownedByMe?: boolean;
  owners?: { displayName: string; emailAddress: string }[];
  lastModifyingUser?: { displayName: string; emailAddress: string };
  description?: string;
  fileExtension?: string;
  md5Checksum?: string;
}

interface DriveLsResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

const FILE_TYPE_FILTERS = [
  { value: "all", title: "All Files", query: "" },
  { value: "recent", title: "Recent", query: "modifiedTime > '${recent}'" },
  { value: "starred", title: "Starred", query: "starred = true" },
  { value: "shared", title: "Shared with Me", query: "sharedWithMe = true" },
  {
    value: "folders",
    title: "Folders",
    query: "mimeType='application/vnd.google-apps.folder'",
  },
  {
    value: "docs",
    title: "Documents",
    query: "mimeType='application/vnd.google-apps.document'",
  },
  {
    value: "sheets",
    title: "Spreadsheets",
    query: "mimeType='application/vnd.google-apps.spreadsheet'",
  },
  {
    value: "slides",
    title: "Presentations",
    query: "mimeType='application/vnd.google-apps.presentation'",
  },
  { value: "images", title: "Images", query: "mimeType contains 'image/'" },
  { value: "pdfs", title: "PDFs", query: "mimeType='application/pdf'" },
  { value: "videos", title: "Videos", query: "mimeType contains 'video/'" },
];

function getFileIcon(mimeType?: string): Icon {
  if (!mimeType) return Icon.BlankDocument;
  if (mimeType.includes("folder")) return Icon.Folder;
  if (mimeType.includes("document")) return Icon.BlankDocument;
  if (mimeType.includes("spreadsheet")) return Icon.BarChart;
  if (mimeType.includes("presentation")) return Icon.AppWindowGrid2x2;
  if (mimeType.includes("image")) return Icon.Image;
  if (mimeType.includes("video")) return Icon.Video;
  if (mimeType.includes("audio")) return Icon.Music;
  if (mimeType.includes("pdf")) return Icon.BlankDocument;
  return Icon.BlankDocument;
}

function formatFileSize(bytes?: string): string {
  if (!bytes) return "";
  const num = parseInt(bytes, 10);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface CreateFolderFormProps {
  account: string;
  parentId?: string;
  onComplete: () => void;
}

function CreateFolderForm({
  account,
  parentId,
  onComplete,
}: CreateFolderFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Plus}
            title="Create Folder"
            onSubmit={async (values) => {
              try {
                const { name } = values as { name: string };
                let cmd = `gog drive mkdir --account "${account}" "${name}"`;
                if (parentId) cmd += ` --parent ${parentId}`;
                await execAsync(cmd);
                showToast({ title: "Folder created" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to create folder",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Folder Name" />
    </Form>
  );
}

interface RenameFormProps {
  account: string;
  file: DriveFile;
  onComplete: () => void;
}

function RenameForm({ account, file, onComplete }: RenameFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Pencil}
            title="Rename"
            onSubmit={async (values) => {
              try {
                const { name } = values as { name: string };
                await execAsync(
                  `gog drive rename --account "${account}" ${file.id} "${name}"`,
                );
                showToast({ title: "Renamed" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to rename",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="New Name" defaultValue={file.name} />
    </Form>
  );
}

interface ShareFormProps {
  account: string;
  file: DriveFile;
  onComplete: () => void;
}

function ShareForm({ account, file, onComplete }: ShareFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.AddPerson}
            title="Share"
            onSubmit={async (values) => {
              try {
                const { email, role, anyone } = values as {
                  email?: string;
                  role: string;
                  anyone?: boolean;
                };
                let cmd = `gog drive share --account "${account}" ${file.id} --role ${role}`;
                if (anyone) {
                  cmd += " --anyone";
                } else if (email) {
                  cmd += ` --email "${email}"`;
                }
                await execAsync(cmd);
                showToast({ title: "Shared" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to share",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text={`Sharing: ${file.name}`} />
      <Form.Checkbox id="anyone" label="Anyone with the link" />
      <Form.TextField id="email" title="Email" />
      <Form.Dropdown id="role" title="Permission" defaultValue="reader">
        <Form.Dropdown.Item value="reader" title="Viewer" />
        <Form.Dropdown.Item value="writer" title="Editor" />
      </Form.Dropdown>
    </Form>
  );
}

// Upload File Form
interface UploadFormProps {
  account: string;
  parentId?: string;
  onComplete: () => void;
}

function UploadForm({ account, parentId, onComplete }: UploadFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Upload}
            title="Upload"
            onSubmit={async (values) => {
              try {
                const { path, name } = values as {
                  path: string;
                  name?: string;
                };
                let cmd = `gog drive upload --account "${account}" "${path}"`;
                if (parentId) cmd += ` --parent ${parentId}`;
                if (name) cmd += ` --name "${name}"`;
                showToast({ title: "Uploading..." });
                await execAsync(cmd);
                showToast({ title: "Uploaded" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to upload",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="path" title="File Path (e.g., /path/to/file.pdf)" />
      <Form.TextField id="name" title="Name (optional, uses original name)" />
    </Form>
  );
}

// Move File Form
interface MoveFormProps {
  account: string;
  file: DriveFile;
  onComplete: () => void;
}

function MoveForm({ account, file, onComplete }: MoveFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.ArrowRight}
            title="Move"
            onSubmit={async (values) => {
              try {
                const { folderId } = values as { folderId: string };
                await execAsync(
                  `gog drive move --account "${account}" ${file.id} --parent ${folderId}`,
                );
                showToast({ title: "Moved" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to move",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text={`Moving: ${file.name}`} />
      <Form.TextField
        id="folderId"
        title="Destination Folder ID (use 'root' for My Drive)"
      />
    </Form>
  );
}

// Search Drive View
function SearchDriveView({ account }: { account: string }) {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { push } = useNavigation();

  const searchFiles = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    try {
      setIsLoading(true);
      const { stdout } = await execAsync(
        `gog drive search --account "${account}" "${query}" --max 50 --json`,
      );
      const data: DriveLsResponse = JSON.parse(stdout);
      setResults(data.files || []);
    } catch (error) {
      console.error(error);
      showToast({ title: "Search failed", style: Toast.Style.Failure });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchFiles(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, searchFiles]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Drive..."
      filtering={false}
      onSearchTextChange={setSearchText}
    >
      {results.length === 0 && !isLoading && searchText ? (
        <List.EmptyView
          title="No Results"
          description={`No files found for "${searchText}"`}
          icon={Icon.MagnifyingGlass}
        />
      ) : (
        results.map((file) => {
          const isFolder = file.mimeType?.includes("folder");
          return (
            <List.Item
              key={file.id}
              title={file.name}
              accessories={[
                ...(file.starred
                  ? [{ icon: Icon.Star, tooltip: "Starred" }]
                  : []),
                ...(file.shared
                  ? [{ icon: Icon.AddPerson, tooltip: "Shared" }]
                  : []),
                ...(file.size ? [{ text: formatFileSize(file.size) }] : []),
                ...(file.modifiedTime
                  ? [{ text: file.modifiedTime.split("T")[0] }]
                  : []),
              ]}
              icon={getFileIcon(file.mimeType)}
              actions={
                <ActionPanel>
                  {isFolder ? (
                    <Action
                      title="Open Folder"
                      icon={Icon.Folder}
                      onAction={() =>
                        push(
                          <FolderView
                            account={account}
                            folderId={file.id}
                            folderName={file.name}
                          />,
                        )
                      }
                    />
                  ) : (
                    <Action.OpenInBrowser
                      icon={Icon.Link}
                      title="Open in Drive"
                      url={file.webViewLink || ""}
                    />
                  )}
                  <Action.CopyToClipboard
                    icon={Icon.CopyClipboard}
                    title="Copy Link"
                    content={file.webViewLink || ""}
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}

// Permissions View
interface Permission {
  id: string;
  type: string;
  role: string;
  emailAddress?: string;
  displayName?: string;
  domain?: string;
  photoLink?: string;
  deleted?: boolean;
  pendingOwner?: boolean;
}

interface PermissionsResponse {
  permissions: Permission[];
}

interface PermissionsViewProps {
  account: string;
  file: DriveFile;
  onComplete: () => void;
}

function PermissionsView({ account, file, onComplete }: PermissionsViewProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

  const loadPermissions = useCallback(async () => {
    try {
      setIsLoading(true);
      const { stdout } = await execAsync(
        `gog drive permissions --account "${account}" ${file.id} --json`,
      );
      const data: PermissionsResponse = JSON.parse(stdout);
      setPermissions(data.permissions || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Failed to load permissions",
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [file.id]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const removePermission = async (permissionId: string) => {
    try {
      await execAsync(
        `gog drive unshare --account "${account}" ${file.id} ${permissionId} --force`,
      );
      showToast({ title: "Permission removed" });
      await loadPermissions();
      onComplete();
    } catch (error) {
      console.error(error);
      showToast({
        title: "Failed to remove permission",
        style: Toast.Style.Failure,
      });
    }
  };

  const roleLabels: Record<string, string> = {
    owner: "Owner",
    organizer: "Organizer",
    fileOrganizer: "File Organizer",
    writer: "Editor",
    commenter: "Commenter",
    reader: "Viewer",
  };

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Permissions: ${file.name}`}
      searchBarPlaceholder="Search permissions..."
      actions={
        <ActionPanel>
          <Action
            title="Add Permission"
            icon={Icon.AddPerson}
            onAction={() =>
              push(
                <ShareForm
                  account={account}
                  file={file}
                  onComplete={() => {
                    loadPermissions();
                    onComplete();
                  }}
                />,
              )
            }
          />
          <Action
            title="Refresh"
            icon={Icon.RotateClockwise}
            shortcut={{ modifiers: ["ctrl"], key: "r" }}
            onAction={loadPermissions}
          />
        </ActionPanel>
      }
    >
      {permissions.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No Permissions"
          description="This file has no shared permissions"
          icon={Icon.Lock}
        />
      ) : (
        permissions.map((perm) => {
          const title =
            perm.displayName || perm.emailAddress || perm.domain || perm.type;
          const subtitle =
            perm.type === "anyone"
              ? "Anyone with the link"
              : perm.type === "domain"
                ? `Anyone at ${perm.domain}`
                : perm.emailAddress || "";
          const isOwner = perm.role === "owner";

          return (
            <List.Item
              key={perm.id}
              title={title}
              subtitle={subtitle}
              accessories={[
                {
                  tag: {
                    value: roleLabels[perm.role] || perm.role,
                    color: "#6366f1",
                  },
                },
              ]}
              icon={
                perm.type === "anyone"
                  ? Icon.Globe01
                  : perm.type === "domain"
                    ? Icon.Building
                    : Icon.Person
              }
              actions={
                <ActionPanel>
                  {!isOwner && (
                    <Action
                      title="Remove Permission"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      onAction={() => removePermission(perm.id)}
                    />
                  )}
                  <Action
                    title="Add Permission"
                    icon={Icon.AddPerson}
                    onAction={() =>
                      push(
                        <ShareForm
                          account={account}
                          file={file}
                          onComplete={() => {
                            loadPermissions();
                            onComplete();
                          }}
                        />,
                      )
                    }
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}

// Shared Drives View
interface SharedDrive {
  id: string;
  name: string;
  createdTime?: string;
  hidden?: boolean;
  capabilities?: Record<string, boolean>;
  backgroundImageLink?: string;
  colorRgb?: string;
}

interface SharedDrivesResponse {
  drives: SharedDrive[];
  nextPageToken?: string;
}

function SharedDrivesView({ account }: { account: string }) {
  const [drives, setDrives] = useState<SharedDrive[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

  const loadDrives = useCallback(async () => {
    try {
      setIsLoading(true);
      const { stdout } = await execAsync(
        `gog drive drives --account "${account}" --json`,
      );
      const data: SharedDrivesResponse = JSON.parse(stdout);
      setDrives(data.drives || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Failed to load shared drives",
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrives();
  }, [loadDrives]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search shared drives..."
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.RotateClockwise}
            shortcut={{ modifiers: ["ctrl"], key: "r" }}
            onAction={loadDrives}
          />
        </ActionPanel>
      }
    >
      {drives.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No Shared Drives"
          description="You don't have access to any shared drives"
          icon={Icon.HardDrive}
        />
      ) : (
        drives.map((drive) => (
          <List.Item
            key={drive.id}
            title={drive.name}
            icon={Icon.HardDrive}
            actions={
              <ActionPanel>
                <Action
                  title="Open Drive"
                  icon={Icon.Folder}
                  onAction={() =>
                    push(
                      <FolderView
                        account={account}
                        folderId={drive.id}
                        folderName={drive.name}
                      />,
                    )
                  }
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

interface FolderViewProps {
  account: string;
  folderId: string;
  folderName: string;
}

function FolderView({ account, folderId, folderName }: FolderViewProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

  const loadFiles = useCallback(async () => {
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const { stdout } = await execAsync(
        `gog drive ls --account "${account}" --parent ${folderId} --max 100 --json`,
      );
      const data: DriveLsResponse = JSON.parse(stdout);
      setFiles(data.files || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Error loading files",
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const globalActions = (
    <ActionPanel>
      <Action
        title="Create Folder"
        icon={Icon.Plus}
        onAction={() =>
          push(
            <CreateFolderForm
              account={account}
              parentId={folderId}
              onComplete={loadFiles}
            />,
          )
        }
      />
      <Action
        title="Refresh"
        icon={Icon.RotateClockwise}
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={loadFiles}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={isLoading}
      navigationTitle={folderName}
      searchBarPlaceholder="Search files..."
      actions={globalActions}
    >
      {!isLoading && files.length === 0 ? (
        <List.EmptyView
          title="Empty Folder"
          description="This folder has no files"
          icon={Icon.Folder}
          actions={globalActions}
        />
      ) : (
        <FileList
          account={account}
          files={files}
          onRefresh={loadFiles}
          parentId={folderId}
        />
      )}
    </List>
  );
}

interface FileListProps {
  account: string;
  files: DriveFile[];
  onRefresh: () => void;
  parentId?: string;
}

function FileList({ account, files, onRefresh, parentId }: FileListProps) {
  const { push } = useNavigation();

  const deleteFile = async (file: DriveFile) => {
    try {
      await execAsync(
        `gog drive delete --account "${account}" ${file.id} --force`,
      );
      showToast({ title: "Moved to Trash" });
      onRefresh();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed to delete", style: Toast.Style.Failure });
    }
  };

  // Sort: folders first, then by name
  const sortedFiles = [...files].sort((a, b) => {
    const aIsFolder = a.mimeType?.includes("folder");
    const bIsFolder = b.mimeType?.includes("folder");
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <List.Section title={`${sortedFiles.length} items`}>
      {sortedFiles.map((file) => {
        const isFolder = file.mimeType?.includes("folder");

        return (
          <List.Item
            key={file.id}
            title={file.name}
            accessories={[
              ...(file.starred
                ? [{ icon: Icon.Star, tooltip: "Starred" }]
                : []),
              ...(file.shared
                ? [{ icon: Icon.AddPerson, tooltip: "Shared" }]
                : []),
              ...(file.trashed
                ? [{ tag: { value: "Trashed", color: "#ef4444" } }]
                : []),
              ...(file.mimeType?.includes("folder")
                ? [{ icon: Icon.Folder, tooltip: "Folder" }]
                : file.size
                  ? [{ text: formatFileSize(file.size) }]
                  : []),
              ...(file.modifiedTime
                ? [
                    {
                      text: file.modifiedTime.split("T")[0],
                      tooltip: `Modified: ${file.modifiedTime}`,
                    },
                  ]
                : []),
            ]}
            icon={getFileIcon(file.mimeType)}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  {isFolder ? (
                    <Action
                      title="Open Folder"
                      icon={Icon.Folder}
                      onAction={() =>
                        push(
                          <FolderView
                            account={account}
                            folderId={file.id}
                            folderName={file.name}
                          />,
                        )
                      }
                    />
                  ) : (
                    <>
                      <Action.OpenInBrowser
                        icon={Icon.Link}
                        title="Open in Drive"
                        url={file.webViewLink || ""}
                      />
                      <Action
                        title="Download"
                        icon={Icon.Download}
                        onAction={async () => {
                          try {
                            showToast({ title: "Downloading..." });
                            const { stdout } = await execAsync(
                              `gog drive download --account "${account}" ${file.id} --plain`,
                            );
                            const path = stdout
                              .split("\n")[0]
                              ?.split("\t")[1]
                              ?.trim();
                            if (path) {
                              await open(path);
                            }
                            showToast({
                              title: "Downloaded",
                              message: path || DOWNLOADS_DIR,
                            });
                          } catch (error) {
                            console.error(error);
                            showToast({
                              title: "Failed to download",
                              style: Toast.Style.Failure,
                            });
                          }
                        }}
                      />
                    </>
                  )}
                  <Action.CopyToClipboard
                    icon={Icon.CopyClipboard}
                    title="Copy Link"
                    content={file.webViewLink || ""}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section title="Organize">
                  <Action
                    title="Rename"
                    icon={Icon.Pencil}
                    onAction={() =>
                      push(
                        <RenameForm
                          account={account}
                          file={file}
                          onComplete={onRefresh}
                        />,
                      )
                    }
                  />
                  <Action
                    title="Duplicate"
                    icon={Icon.CopyClipboard}
                    onAction={async () => {
                      try {
                        await execAsync(
                          `gog drive copy --account "${account}" ${file.id} "${file.name} (copy)"`,
                        );
                        showToast({ title: "Duplicated" });
                        onRefresh();
                      } catch (error) {
                        console.error(error);
                        showToast({
                          title: "Failed to duplicate",
                          style: Toast.Style.Failure,
                        });
                      }
                    }}
                  />
                  <Action
                    title="Move"
                    icon={Icon.ArrowRight}
                    onAction={() =>
                      push(
                        <MoveForm
                          account={account}
                          file={file}
                          onComplete={onRefresh}
                        />,
                      )
                    }
                  />
                  <Action
                    title="Share"
                    icon={Icon.AddPerson}
                    onAction={() =>
                      push(
                        <ShareForm
                          account={account}
                          file={file}
                          onComplete={onRefresh}
                        />,
                      )
                    }
                  />
                  <Action
                    title="View Permissions"
                    icon={Icon.Lock}
                    onAction={() =>
                      push(
                        <PermissionsView
                          account={account}
                          file={file}
                          onComplete={onRefresh}
                        />,
                      )
                    }
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Move to Trash"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["shift"], key: "delete" }}
                    onAction={() => deleteFile(file)}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Create Folder"
                    icon={Icon.Plus}
                    onAction={() =>
                      push(
                        <CreateFolderForm
                          account={account}
                          parentId={parentId}
                          onComplete={onRefresh}
                        />,
                      )
                    }
                  />
                  <Action
                    title="Refresh"
                    icon={Icon.RotateClockwise}
                    shortcut={{ modifiers: ["ctrl"], key: "r" }}
                    onAction={onRefresh}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List.Section>
  );
}

export default function Drive() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [account, setAccount] = useState<string>("");
  const { accounts } = useGogAccounts();
  const { push } = useNavigation();

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !account) {
      setAccount(accounts[0]?.email || "");
    }
  }, [accounts, account]);

  const loadFiles = useCallback(async () => {
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }
    if (!account) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const filter = FILE_TYPE_FILTERS.find((f) => f.value === typeFilter);
      let query = filter?.query || "";

      // Handle recent filter specially
      if (typeFilter === "recent") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = `modifiedTime > '${weekAgo.toISOString()}'`;
      }

      const accountArg = `--account "${account}"`;
      const queryArg = query ? ` --query "${query}"` : "";
      const { stdout } = await execAsync(
        `gog drive ls ${accountArg}${queryArg} --max 100 --json`,
      );
      const data: DriveLsResponse = JSON.parse(stdout);
      setFiles(data.files || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Error loading files",
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter, account]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const globalActions = (
    <ActionPanel>
      <Action
        title="Create Folder"
        icon={Icon.Plus}
        onAction={() =>
          push(<CreateFolderForm account={account} onComplete={loadFiles} />)
        }
      />
      <Action
        title="Upload File"
        icon={Icon.Upload}
        onAction={() =>
          push(<UploadForm account={account} onComplete={loadFiles} />)
        }
      />
      <Action
        title="Search Drive"
        icon={Icon.MagnifyingGlass}
        onAction={() => push(<SearchDriveView account={account} />)}
      />
      <Action
        title="Shared Drives"
        icon={Icon.HardDrive}
        onAction={() => push(<SharedDrivesView account={account} />)}
      />
      <Action
        title="Open Downloads Folder"
        icon={Icon.Folder}
        onAction={() => open(DOWNLOADS_DIR)}
      />
      <Action
        title="Refresh"
        icon={Icon.RotateClockwise}
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={loadFiles}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search files..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Account & Filter"
          value={`${account}|${typeFilter}`}
          onChange={(value) => {
            const [acc, filter] = value.split("|");
            if (acc && filter) {
              setAccount(acc);
              setTypeFilter(filter);
            }
          }}
        >
          {accounts.map((acc) => (
            <List.Dropdown.Section key={acc.email} title={acc.email}>
              {FILE_TYPE_FILTERS.map((f) => (
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
      {!isLoading && files.length === 0 ? (
        <List.EmptyView
          title="No Files Found"
          description="Your Drive is empty or no files match the filter"
          icon={Icon.Folder}
          actions={globalActions}
        />
      ) : (
        <FileList account={account} files={files} onRefresh={loadFiles} />
      )}
    </List>
  );
}
