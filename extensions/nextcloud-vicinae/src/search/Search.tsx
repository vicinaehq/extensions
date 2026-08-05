import { Action, ActionPanel, List } from "@vicinae/api";
import filesize from "file-size";
import { SearchResult, useSearch } from "./hooks";
import { getIcon } from "./utils";
import { getBaseUrl } from "../config";
import { useCheckPreferences } from "../preferences";

export function Search() {
  useCheckPreferences();
  const { results, isLoading, search } = useSearch();

  return (
    <List isLoading={isLoading} onSearchTextChange={search} searchBarPlaceholder="Search files..." throttle>
      <List.Section title="Results" subtitle={String(results.length)}>
        {results.map((result) => (
          <Item key={result.fileId} result={result} />
        ))}
      </List.Section>
    </List>
  );
}

function Item({ result }: { result: SearchResult }) {
  const url = result.contentType
    ? `${getBaseUrl()}/apps/files/?dir=${encodeURI(result.dirname)}&openfile=${result.fileId}`
    : `${getBaseUrl()}/apps/files/?dir=${encodeURI(result.fullpath)}&view=files`;
  const approxFileSize = filesize(result.size).human("si");

  return (
    <List.Item
      title={result.filename}
      subtitle={result.dirname}
      accessories={[{ text: approxFileSize }]}
      icon={getIcon(result.contentType)}
      actions={
        <ActionPanel title={result.filename}>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="Open in Browser" url={url} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
