import { useMemo } from "react";
import { type IconIndex, useIconData } from "./useIconData";
import { filterIconIndex } from "../filtering";

type IconEntry = {
  id: string;
  packLabel: string;
  displayName: string;
  char: string;
  code: string;
  hexCode: string;
  htmlEntity: string;
  nerdFontId: string;
  keywords: string[];
  markdown: string;
  iconPath: string;
};

const iconCache = new Map<string, IconEntry>();

function createIconDataURL(char: string, _code: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><text x="128" y="180" font-family="JetBrainsMono Nerd Font Mono,Symbols Nerd Font Mono,monospace" font-size="160" text-anchor="middle" fill="black" font-weight="normal">${char}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function splitNameIntoWords(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[_-]/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function createIconEntry(
  id: string,
  char: string,
  code: string,
  displayName: string,
  packLabel: string,
): IconEntry {
  const [pack, ...rest] = id.split("-");
  const rawName = rest.join("-");
  const words = splitNameIntoWords(rawName);

  const codeUpper = code.toUpperCase();
  const nerdFontId = `nf-${id.replace(/_/g, "-")}`;
  const htmlEntity = `&#x${code};`;
  const iconPath = createIconDataURL(char, code);
  const keywordSet = new Set<string>();

  keywordSet.add(id.toLowerCase());
  keywordSet.add(id.replace(/_/g, " ").toLowerCase());
  keywordSet.add(nerdFontId.toLowerCase());
  keywordSet.add(nerdFontId.replace(/-/g, " "));
  keywordSet.add(pack.toLowerCase());
  keywordSet.add(packLabel.toLowerCase());
  packLabel
    .toLowerCase()
    .split(/\s+/)
    .forEach((token) => {
      if (token) keywordSet.add(token);
    });
  keywordSet.add(code.toLowerCase());
  keywordSet.add(codeUpper);
  keywordSet.add(`0x${code.toLowerCase()}`);
  keywordSet.add(`0x${codeUpper}`);
  keywordSet.add(`\\u${codeUpper}`);
  keywordSet.add(htmlEntity.toLowerCase());
  keywordSet.add(htmlEntity);
  keywordSet.add(displayName.toLowerCase());

  words.forEach((word) => {
    const normalized = word.toLowerCase();
    keywordSet.add(normalized);

    if (normalized.includes("+")) {
      keywordSet.add(normalized.replace("+", "plus"));
      keywordSet.add("+");
    }
    if (normalized.includes("-")) {
      keywordSet.add(normalized.replace("-", " "));
    }
  });

  const markdown = [
    `# ${char} ${displayName}`,
    "",
    `- **Nerd Font name:** \`${nerdFontId}\``,
    `- **Codepoint:** \`${codeUpper}\``,
    `- **HTML entity:** \`${htmlEntity}\``,
  ].join("\n");

  return {
    id,
    packLabel,
    displayName,
    char,
    code,
    hexCode: `0x${codeUpper}`,
    htmlEntity,
    nerdFontId,
    keywords: Array.from(keywordSet),
    markdown,
    iconPath,
  };
}

function getIconEntry(index: IconIndex): IconEntry {
  const cached = iconCache.get(index.id);
  if (cached) {
    return cached;
  }

  const entry = createIconEntry(
    index.id,
    index.char,
    index.code,
    index.displayName,
    index.packLabel,
  );

  iconCache.set(index.id, entry);
  return entry;
}

function loadIconEntries(filteredIndex: IconIndex[]): IconEntry[] {
  return filteredIndex.map((idx) => getIconEntry(idx));
}

export function useIconSearch(searchText: string, selectedPack: string) {
	const { iconIndex, isLoading, fuseInstance } = useIconData();

	const filteredIndex = useMemo(() => {
		return filterIconIndex({
			iconIndex,
			fuseInstance,
			searchText,
			selectedPack,
		});
	}, [iconIndex, selectedPack, searchText, fuseInstance]);

	const icons = useMemo(() => {
		if (filteredIndex.length === 0) {
			return [];
		}

		return loadIconEntries(filteredIndex);
	}, [filteredIndex]);

	return {
		icons,
		isLoading,
	};
}

export type { IconEntry };
