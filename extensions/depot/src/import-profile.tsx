import {
  Action,
  ActionPanel,
  Icon,
  List,
  environment,
} from "@vicinae/api";
import { basename, dirname } from "node:path";
import { useEffect, useMemo, useState } from "react";
import { listInstalledAppImages } from "./appimages.ts";
import {
  PackageBatchReview,
} from "./bundles.tsx";
import { operationErrorMessage } from "./errors.ts";
import { useIndexedFileSearch } from "./hooks/use-indexed-file-search.ts";
import {
  profileAppImageReviewItems,
  profileBundle,
} from "./profile-import.ts";
import {
  readSoftwareProfile,
  type SoftwareProfile,
} from "./software-profiles.ts";
import { isProcessAborted } from "./utils/process.ts";

const PROFILE_SEARCH = {
  extensions: [".json"],
  limitPerExtension: 60,
  resultLimit: 30,
} as const;

export default function ImportProfileCommand() {
  const [searchText, setSearchText] = useState("");
  const {
    files,
    isLoading,
    error: searchError,
  } = useIndexedFileSearch(searchText, PROFILE_SEARCH);

  return (
    <List
      navigationTitle="Import Software Profile"
      searchBarPlaceholder="Search profile files or paste an absolute path"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      isLoading={isLoading}
    >
      {files.map((file) => (
        <List.Item
          key={file.path}
          id={file.path}
          title={basename(file.path)}
          subtitle={dirname(file.path)}
          icon={Icon.BlankDocument}
          actions={
            <ActionPanel>
              <Action.Push
                title="Review Software Profile"
                icon={Icon.CheckList}
                target={<ImportedProfileReview filePath={file.path} />}
              />
              <Action.ShowInFinder title="Show Profile File" path={file.path} select />
              <Action.CopyToClipboard title="Copy File Path" content={file.path} />
            </ActionPanel>
          }
        />
      ))}
      {files.length === 0 && (
        <List.EmptyView
          icon={Icon.BlankDocument}
          title={profileEmptyTitle(searchText, searchError)}
          description={profileEmptyDescription(searchText, searchError)}
        />
      )}
    </List>
  );
}

function ImportedProfileReview({ filePath }: { filePath: string }) {
  const [profile, setProfile] = useState<SoftwareProfile>();
  const [installedAppImageNames, setInstalledAppImageNames] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [error, setError] = useState<string>();
  const [appImageError, setAppImageError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    setProfile(undefined);
    setError(undefined);
    setAppImageError(undefined);
    Promise.allSettled([
      readSoftwareProfile(filePath),
      listInstalledAppImages(
        { supportPath: environment.supportPath },
        controller.signal,
      ),
    ]).then(([profileResult, appImageResult]) => {
      if (controller.signal.aborted) return;
      if (profileResult.status === "rejected") {
        if (isProcessAborted(profileResult.reason)) return;
        setError(operationErrorMessage(
          profileResult.reason,
          "Software profile could not be read",
        ));
        return;
      }
      setProfile(profileResult.value);
      if (appImageResult.status === "fulfilled") {
        setInstalledAppImageNames(new Set(
          appImageResult.value.map((item) => item.fileName),
        ));
      } else if (!isProcessAborted(appImageResult.reason)) {
        setInstalledAppImageNames(new Set());
        setAppImageError(operationErrorMessage(
          appImageResult.reason,
          "AppImage inspection is unavailable",
        ));
      }
    });
    return () => controller.abort();
  }, [filePath]);

  const bundle = useMemo(
    () => profile ? profileBundle(profile, filePath) : undefined,
    [filePath, profile],
  );
  const appImages = useMemo(
    () => profile
      ? profileAppImageReviewItems(profile, installedAppImageNames, appImageError)
      : [],
    [appImageError, installedAppImageNames, profile],
  );

  if (error) {
    return (
      <List navigationTitle="Import Software Profile">
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="Profile could not be imported"
          description={error}
        />
      </List>
    );
  }
  if (!profile || !bundle) {
    return <List navigationTitle="Import Software Profile" isLoading />;
  }
  return <PackageBatchReview bundle={bundle} reviewOnlyItems={appImages} />;
}

function profileEmptyTitle(query: string, error?: string): string {
  if (error) return "Profile search failed";
  if (!query.trim()) return "Search software profiles";
  if (query.trim().length < 2) return "Keep typing";
  return "No JSON profile files found";
}

function profileEmptyDescription(query: string, error?: string): string {
  if (error) return error;
  if (!query.trim()) {
    return "Type a filename or paste the absolute path to a Depot JSON profile.";
  }
  if (query.trim().length < 2) return "Enter at least two characters to search.";
  return "Try another filename or paste the profile's absolute path.";
}
