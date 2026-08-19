import { Color, List } from "@vicinae/api";
import { type Bookmark, bookmarkTags } from "../lib/buku";

export function BookmarkDetail({ bookmark }: { bookmark: Bookmark }) {
  const tags = bookmarkTags(bookmark);
  const description = bookmark.description.trim();

  return (
    <List.Item.Detail
      markdown={description || "_No description._"}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Link title="URL" target={bookmark.uri} text={bookmark.uri} />
          {tags.length > 0 && (
            <List.Item.Detail.Metadata.TagList title="Tags">
              {tags.map((tag) => (
                <List.Item.Detail.Metadata.TagList.Item key={tag} text={tag} color={Color.SecondaryText} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          )}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="buku ID" text={String(bookmark.index)} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}
