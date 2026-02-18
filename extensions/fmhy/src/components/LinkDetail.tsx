import { Detail, ActionPanel, Action, Icon, Color, open } from "@raycast/api";
import type { FMHYLink } from "../types";

interface LinkDetailProps {
  link: FMHYLink;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onVisit?: (id: string) => void;
}

export function LinkDetail({ link, isFavorite, onToggleFavorite, onVisit }: LinkDetailProps) {
  const isBase64 = link.categorySlug === "base64" || (!link.url.includes("://") && /^[a-zA-Z0-9+/]+=*$/.test(link.url));
  let decodedUrl = "";
  if (isBase64) {
    try {
      decodedUrl = atob(link.url);
    } catch (e) {
      console.error("Failed to decode base64", e);
    }
  }

  const markdown = `
# ${link.title}

${link.isStarred ? "⭐ **Recommended by FMHY**" : ""}

**Category:** ${link.category} ${link.subcategory ? `> ${link.subcategory}` : ""} ${link.subSubcategory ? `> ${link.subSubcategory}` : ""}

${
  isBase64 && decodedUrl
    ? `
**Decoded Link:**
\`${decodedUrl}\`
`
    : ""
}

---

${link.description || "_No description provided._"}

---

**Section on FMHY Website:** [${link.subcategory}](${link.fmhyUrl})
    `;

  const handleOpen = async () => {
    onVisit?.(link.id);
    if (isBase64 && decodedUrl && decodedUrl.startsWith("http")) {
      await open(decodedUrl);
    } else {
      await open(link.url);
    }
  };

  return (
    <Detail
      navigationTitle={link.title}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Category" text={link.category} icon={link.icon} />
          {link.subcategory && <Detail.Metadata.Label title="Subcategory" text={link.subcategory} />}
          {link.subSubcategory && <Detail.Metadata.Label title="Topic" text={link.subSubcategory} />}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Link title="Target URL" target={link.url} text={link.url} />
          {isBase64 && decodedUrl && <Detail.Metadata.Label title="Decoded" text={decodedUrl} />}
          {link.isStarred && (
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Recommended" color={Color.Yellow} />
            </Detail.Metadata.TagList>
          )}
          {isFavorite !== undefined && (
            <Detail.Metadata.TagList title="User">
              {isFavorite ? (
                <Detail.Metadata.TagList.Item text="Favorited" color={Color.Yellow} />
              ) : (
                <Detail.Metadata.TagList.Item text="Not Favorited" color={Color.SecondaryText} />
              )}
            </Detail.Metadata.TagList>
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action title={isBase64 ? "Open Decoded Link" : "Open Link"} icon={Icon.Globe} onAction={handleOpen} />
          {isBase64 && decodedUrl && (
            <Action.CopyToClipboard
              title="Copy Decoded URL"
              content={decodedUrl}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          )}
          {onToggleFavorite && (
            <Action
              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              icon={isFavorite ? Icon.StarDisabled : Icon.Star}
              shortcut={{ modifiers: ["cmd"], key: "d" }}
              onAction={onToggleFavorite}
            />
          )}
          <Action.CopyToClipboard title="Copy Raw URL" content={link.url} shortcut={{ modifiers: ["cmd"], key: "c" }} />
          <Action.OpenInBrowser
            title="Open on FMHY Website"
            url={link.fmhyUrl}
            icon={Icon.Book}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
        </ActionPanel>
      }
    />
  );
}
