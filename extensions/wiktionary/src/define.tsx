import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  List,
  Toast,
  getPreferenceValues,
  getSelectedText,
  showToast,
} from "@vicinae/api";
import { useFetch } from "@raycast/utils";
import { useEffect, useState } from "react";
import TurndownService from "turndown";

interface Thumbnail {
  mimetype: string;
  width: number;
  height: number;
  duration: number | null;
  url: string;
}

interface Page {
  id: number;
  key: string;
  title: string;
  excerpt: string;
  matched_title: string | null;
  description: string | null;
  thumbnail: Thumbnail | null;
}

interface ParsedExample {
  example: string;
}

// Represents a single definition object
interface Definition {
  definition: string;
  parsedExamples?: ParsedExample[]; // Optional, as it’s not always present
  examples?: string[]; // Optional, as it’s not always present
}

// Represents a language entry (e.g., English)
interface LanguageEntry {
  partOfSpeech: string;
  language: string;
  definitions: Definition[];
}

// Top-level structure
interface DefinitionsRes {
  [lang: string]: LanguageEntry[];
}

const HEADERS = { "User-Agent": "Vicinae-Wiktionary-Extension" };

export default function DefineSuggestions() {
  const preferences = getPreferenceValues();
  const preferredSource: string = preferences.source;

  const [text, setText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Page[]>([]);

  const apiUrl = `https://en.wiktionary.org/w/rest.php/v1/search/title?q=${text}&limit=10`;

  useEffect(() => {
    if (preferredSource == "selection") {
      getSelectedText().then((selectedText) => {
        if (text == "" && selectedText != "") {
          setText(selectedText);
        }
      });
    }
    if (preferredSource == "clipboard") {
      Clipboard.readText().then((clipboardText) => {
        if (text == "" && clipboardText != "") {
          setText(clipboardText);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (text.length === 0) {
      setSuggestions([]);
      return; // Don't fetch if text is empty
    }

    setIsLoading(true);
    setError(null);

    fetch(apiUrl, {
      headers: HEADERS,
    })
      .then((response) => response.json())
      .then((data) => {
        const pages = (data as { pages?: Page[] }).pages || [];
        setSuggestions(pages);
        setIsLoading(false);
      })
      .catch(() => {
        setError("Failed to load suggestions.");
        setIsLoading(false);
      });
  }, [text]);

  return (
    <List searchBarPlaceholder="Search Wiktionary" onSearchTextChange={setText} isLoading={isLoading} throttle>
      {error && <List.Item title="Error" subtitle={error} />}
      {!error &&
        suggestions.map((page) => (
          <List.Item
            icon={{
              source: page?.thumbnail?.url ? "https:" + page.thumbnail.url : "../assets/icon.svg",
            }}
            id={page.id.toString()}
            key={page.id}
            title={page.title}
            actions={
              <ActionPanel>
                <Action.Push icon={Icon.Eye} title="Show Definitions" target={<Define title={page.title} />} />
                <Action.OpenInBrowser
                  title="Open in Wiktionary"
                  url={`https://en.wiktionary.org/wiki/${encodeURIComponent(page.title)}`}
                />
                <Action.CopyToClipboard title="Copy Title" content={page.title} />
              </ActionPanel>
            }
          />
        ))}
    </List>
  );
}

export function Define({ title }: { title: string }) {
  const preferences = getPreferenceValues();
  const resultLanguages: string[] = preferences.resultLanguages
    .split(",")
    .map((lang: string) => lang.trim())
    .filter((lang: string) => lang !== "");

  const [content, setContent] = useState<string>("");

  // Documentation: https://en.wiktionary.org/wiki/Special:RestSandbox/wmf-restbase#/Page_content/get_page_definition_term
  const apiUrl = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title.trim())}`;
  const { data, isLoading, error } = useFetch(apiUrl, { headers: HEADERS });

  useEffect(() => {
    if (!data) return;
    try {
      const definitionsResponse = data as DefinitionsRes;
      const td = new TurndownService();

      td.addRule("remove-links", {
        filter: ["a"],
        replacement: function (content) {
          return content;
        },
      });

      let markdown = "";

      const languages =
        resultLanguages.length > 0
          ? resultLanguages.filter((lang) => lang in definitionsResponse)
          : Object.keys(definitionsResponse);

      languages.forEach((lang) => {
        const defs = definitionsResponse[lang];

        if (defs.length == 0) return;
        const langName = defs[0].language;
        markdown += `# ${langName}\n`;

        defs.forEach((item) => {
          markdown += `## ${item.partOfSpeech}\n`;

          item.definitions.forEach((definition) => {
            if (definition.definition == "") return;

            const firstDefinitionLine = definition.definition.split("\n")[0];
            const definitionText = td.turndown(firstDefinitionLine);
            markdown += `1. ${definitionText}\n`;

            if (definition.parsedExamples) {
              definition.parsedExamples.forEach((example: { example: string | TurndownService.Node }) => {
                const exampleText = td.turndown(example.example);
                if (exampleText.length === 0) return;
                markdown += `\t- ${exampleText}\n`;
              });
            }
          });
        });
      });

      setContent(markdown);
    } catch (err) {
      console.error("Error processing API data:", err);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to process definition",
        message: "There was an error processing the definition data",
      });
      setContent(`# Error\nCould not process definition for "${title}". Please try again later.`);
    }
  }, [data]);

  if (isLoading) {
    return <Detail markdown={`# Looking up "${title}" on Wiktionary`} />;
  }

  if (error) {
    return (
      <Detail
        markdown={`# Error\nCould not find definition for "${title}". The word may not exist in Wiktionary or there might be a network issue.`}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser
              title="Search on Wiktionary Website"
              url={`https://en.wiktionary.org/wiki/${encodeURIComponent(title)}`}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Detail
      markdown={content}
      navigationTitle={`${title}`}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open in Wiktionary"
            url={`https://en.wiktionary.org/wiki/${encodeURIComponent(title)}`}
          />
        </ActionPanel>
      }
    />
  );
}
