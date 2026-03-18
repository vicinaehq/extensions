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
import { ensureGogInstalled, useGogAccounts } from "../utils";

const execAsync = promisify(exec);
const DOWNLOADS_DIR = join(homedir(), ".config/gogcli/drive-downloads");

interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  createdTime?: string;
  parents?: string[];
  webViewLink?: string;
  starred?: boolean;
  trashed?: boolean;
  shared?: boolean;
  ownedByMe?: boolean;
  owners?: { displayName: string; emailAddress: string }[];
  lastModifyingUser?: { displayName: string; emailAddress: string };
}

interface DriveLsResponse {
  files: WorkspaceFile[];
  nextPageToken?: string;
}

export interface ExportFormat {
  format: string;
  title: string;
}

export interface WorkspaceConfig {
  service: "docs" | "sheets" | "slides";
  mimeType: string;
  singularName: string;
  pluralName: string;
  icon: Icon;
  exportFormats: ExportFormat[];
}

interface FileInfo {
  id: string;
  title?: string;
  name?: string;
  webViewLink?: string;
  mimeType?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  owners?: { displayName: string; emailAddress: string }[];
  lastModifyingUser?: { displayName: string; emailAddress: string };
  shared?: boolean;
  starred?: boolean;
}

interface CreateFileFormProps {
  account: string;
  config: WorkspaceConfig;
  onComplete: () => void;
}

function CreateFileForm({ account, config, onComplete }: CreateFileFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Plus}
            title={`Create ${config.singularName}`}
            onSubmit={async (values) => {
              try {
                const { title } = values as { title: string };
                await execAsync(
                  `gog ${config.service} create --account "${account}" "${title}"`,
                );
                showToast({ title: `${config.singularName} created` });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: `Failed to create ${config.singularName.toLowerCase()}`,
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title={`${config.singularName} Title`} />
    </Form>
  );
}

const VIEW_FILTERS = [
  { value: "all", title: "All Files", queryExtra: "and trashed = false" },
  {
    value: "starred",
    title: "Starred",
    queryExtra: "and starred = true and trashed = false",
  },
  {
    value: "shared",
    title: "Shared with Me",
    queryExtra: "and sharedWithMe = true and trashed = false",
  },
  { value: "trash", title: "Trash", queryExtra: "and trashed = true" },
];

interface WorkspaceFileListProps {
  config: WorkspaceConfig;
}

export function WorkspaceFileList({ config }: WorkspaceFileListProps) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState("all");
  const [account, setAccount] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<Record<string, FileInfo>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>(
    {},
  );
  const [docContents, setDocContents] = useState<Record<string, string>>({});
  const { accounts } = useGogAccounts();
  const { push } = useNavigation();

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !account) {
      setAccount(accounts[0]?.email || "");
    }
  }, [accounts, account]);

  // Load file detail
  const loadFileDetail = useCallback(
    async (fileId: string) => {
      if (fileDetails[fileId] || loadingDetails[fileId] || !account) return;

      setLoadingDetails((prev) => ({ ...prev, [fileId]: true }));
      try {
        // Use drive get for all file types (sheets/slides don't have info command)
        const { stdout } = await execAsync(
          `gog drive get --account "${account}" ${fileId} --json`,
        );
        const detail: FileInfo = JSON.parse(stdout);
        setFileDetails((prev) => ({ ...prev, [fileId]: detail }));

        // Auto-load content based on service type
        if (!docContents[fileId]) {
          try {
            let content = "";

            if (config.service === "docs") {
              const { stdout: docContent } = await execAsync(
                `gog docs cat --account "${account}" ${fileId}`,
              );
              content = docContent;
            } else if (config.service === "sheets") {
              const { stdout: sheetData } = await execAsync(
                `gog sheets get --account "${account}" ${fileId} "A1:Z50" --json`,
              );
              const data = JSON.parse(sheetData);
              const values: string[][] = data.values || [];
              if (values.length > 0) {
                const headers = values[0] || [];
                const rows = values.slice(1);
                const headerRow = `| ${headers.join(" | ")} |`;
                const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
                const dataRows = rows
                  .map((row) => `| ${row.join(" | ")} |`)
                  .join("\n");
                content = `${headerRow}\n${separatorRow}\n${dataRows}`;
              } else {
                content = "*No data*";
              }
            }
            // Slides don't have a content preview command
            if (content) {
              setDocContents((prev) => ({ ...prev, [fileId]: content }));
            }
          } catch (error) {
            console.error("Failed to load content:", error);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingDetails((prev) => ({ ...prev, [fileId]: false }));
      }
    },
    [fileDetails, loadingDetails, account, config.service, docContents],
  );

  // Load detail when selection changes
  useEffect(() => {
    if (selectedId) {
      loadFileDetail(selectedId);
    }
  }, [selectedId, loadFileDetail]);

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
      const filter = VIEW_FILTERS.find((f) => f.value === viewFilter);
      const query = `mimeType='${config.mimeType}' ${filter?.queryExtra || ""}`;
      const accountArg = `--account "${account}"`;
      const { stdout } = await execAsync(
        `gog drive ls ${accountArg} --query "${query}" --json`,
      );
      const data: DriveLsResponse = JSON.parse(stdout);
      setFiles(data.files || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: `Error loading ${config.pluralName.toLowerCase()}`,
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [config, viewFilter, account]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const downloadFile = async (
    fileId: string,
    format: string,
    formatTitle: string,
  ) => {
    try {
      const { stdout } = await execAsync(
        `gog ${config.service} export --account "${account}" ${fileId} --format ${format} --plain`,
      );
      const path = stdout.split("\n")[0]?.split("\t")[1]?.trim();
      if (path) await open(path);
      showToast({
        title: `Downloaded ${formatTitle}`,
        message: path || DOWNLOADS_DIR,
      });
    } catch (error) {
      console.error(error);
      showToast({
        title: "Failed to download",
        style: Toast.Style.Failure,
      });
    }
  };

  const duplicateFile = async (file: WorkspaceFile) => {
    try {
      await execAsync(
        `gog ${config.service} copy --account "${account}" ${file.id} "${file.name} (copy)"`,
      );
      showToast({ title: "Duplicated" });
      loadFiles();
    } catch (error) {
      console.error(error);
      showToast({
        title: "Failed to duplicate",
        style: Toast.Style.Failure,
      });
    }
  };

  const globalActions = (
    <ActionPanel>
      <Action
        title={`Create ${config.singularName}`}
        icon={Icon.Plus}
        onAction={() =>
          push(
            <CreateFileForm
              account={account}
              config={config}
              onComplete={loadFiles}
            />,
          )
        }
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
      isShowingDetail
      onSelectionChange={(id) => setSelectedId(id || null)}
      searchBarPlaceholder={`Search ${config.pluralName.toLowerCase()}...`}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Account & Filter"
          value={`${account}|${viewFilter}`}
          onChange={(value) => {
            const [acc, filter] = value.split("|");
            if (acc && filter) {
              setAccount(acc);
              setViewFilter(filter);
            }
          }}
        >
          {accounts.map((acc) => (
            <List.Dropdown.Section key={acc.email} title={acc.email}>
              {VIEW_FILTERS.map((f) => (
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
          title={`No ${config.pluralName} Found`}
          description={`Create a ${config.singularName.toLowerCase()} to get started`}
          icon={config.icon}
          actions={globalActions}
        />
      ) : (
        files.map((file) => {
          const detail = fileDetails[file.id];
          const isLoadingDetail = loadingDetails[file.id] || false;
          const MAX_PREVIEW_SIZE = 2000; // 2KB max for preview to avoid crashes
          const rawContent =
            config.service === "docs" || config.service === "sheets"
              ? docContents[file.id]
              : undefined;
          const docContent =
            rawContent && rawContent.length < MAX_PREVIEW_SIZE
              ? rawContent
              : undefined;

          return (
            <List.Item
              key={file.id}
              id={file.id}
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
              ]}
              icon={config.icon}
              detail={
                <List.Item.Detail
                  isLoading={isLoadingDetail}
                  markdown={docContent || ""}
                  metadata={
                    <List.Item.Detail.Metadata>
                      {detail?.createdTime && (
                        <List.Item.Detail.Metadata.Label
                          title="Created"
                          text={detail.createdTime.split("T")[0] ?? ""}
                        />
                      )}
                      {detail?.modifiedTime && (
                        <List.Item.Detail.Metadata.Label
                          title="Modified"
                          text={detail.modifiedTime.split("T")[0] ?? ""}
                        />
                      )}
                      {(detail?.owners?.[0]?.displayName ||
                        detail?.owners?.[0]?.emailAddress) && (
                        <List.Item.Detail.Metadata.Label
                          title="Owner"
                          text={
                            (detail.owners![0].displayName ||
                              detail.owners![0].emailAddress)!
                          }
                        />
                      )}
                      {(detail?.lastModifyingUser?.displayName ||
                        detail?.lastModifyingUser?.emailAddress) && (
                        <List.Item.Detail.Metadata.Label
                          title="Last Modified By"
                          text={
                            (detail.lastModifyingUser.displayName ||
                              detail.lastModifyingUser.emailAddress)!
                          }
                        />
                      )}
                      <List.Item.Detail.Metadata.Label
                        title="Shared"
                        text={detail?.shared ? "Yes" : "No"}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Starred"
                        text={detail?.starred ? "Yes" : "No"}
                      />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.OpenInBrowser
                      icon={Icon.Link}
                      title={`Open ${config.singularName}`}
                      url={file.webViewLink || ""}
                    />

                    {config.service === "sheets" && rawContent && (
                      <Action.CopyToClipboard
                        title="Copy Data to Clipboard"
                        icon={Icon.CopyClipboard}
                        content={rawContent}
                      />
                    )}
                    <Action.CopyToClipboard
                      icon={Icon.CopyClipboard}
                      title="Copy Link"
                      content={file.webViewLink || ""}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section title="Download">
                    {config.exportFormats.map((fmt) => (
                      <Action
                        key={fmt.format}
                        title={`Download as ${fmt.title}`}
                        icon={Icon.Download}
                        onAction={() =>
                          downloadFile(file.id, fmt.format, fmt.title)
                        }
                      />
                    ))}
                  </ActionPanel.Section>
                  <ActionPanel.Section title="Manage">
                    <Action
                      title="Duplicate"
                      icon={Icon.CopyClipboard}
                      onAction={() => duplicateFile(file)}
                    />
                    {viewFilter !== "trash" && (
                      <Action
                        title="Move to Trash"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["shift"], key: "delete" }}
                        onAction={async () => {
                          try {
                            await execAsync(
                              `gog drive delete --account "${account}" ${file.id} --force`,
                            );
                            showToast({ title: "Moved to Trash" });
                            loadFiles();
                          } catch (error) {
                            console.error(error);
                            showToast({
                              title: "Failed to trash",
                              style: Toast.Style.Failure,
                            });
                          }
                        }}
                      />
                    )}
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action
                      title={`Create ${config.singularName}`}
                      icon={Icon.Plus}
                      onAction={() =>
                        push(
                          <CreateFileForm
                            account={account}
                            config={config}
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
