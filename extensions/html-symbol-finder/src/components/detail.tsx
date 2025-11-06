import { List } from "@vicinae/api";
import { useListContext } from "~/context";
import { numberToHex } from "~/helpers/string";
import { Character } from "~/types";

export const CharacterDetail = ({ item }: { item: Character }) => {
  const { findHtmlEntity } = useListContext();
  const html = findHtmlEntity(item.c);

  const markdown = `# ${item.v}\n---\n## ${item.n.toLowerCase().charAt(0).toUpperCase() + item.n.slice(1).toLowerCase()}`;

  return (
    <List.Item.Detail
      markdown={markdown}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="HTML Entity" text={html?.toLowerCase() ?? ""} />
          <List.Item.Detail.Metadata.Label title="HTML Code" text={`&#${item.c};`} />
          <List.Item.Detail.Metadata.Label
            title="Hex Code"
            text={`&#x${numberToHex(item.c).replace("00", "").toLowerCase()};`}
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
};
