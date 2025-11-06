import { memo } from "react";

import { List } from "@vicinae/api";

import { CharacterActionPanel } from "~/components/action-panel";
import { DataSetSelector } from "~/components/dataset-selector";
import { useListContext } from "~/context";
import { getFilteredSubtitle, getFilteredValue } from "~/helpers/string";
import { CharacterDetail } from "./detail";

export const CharactersList = memo(() => {
  const { list, onSearchTextChange, loading } = useListContext();

  return (
    <List
      isShowingDetail
      isLoading={loading}
      onSearchTextChange={onSearchTextChange}
      filtering={false}
      searchBarAccessory={<DataSetSelector />}
    >
      {list.map((section) => (
        <List.Section key={`${section.sectionTitle}-${section.items.length}`} title={section.sectionTitle}>
          {section.items.map((item) => {
            const accessories = [];
            if (item.a?.length) {
              accessories.push({ icon: "⌨", text: `${item.a.join(", ")}` });
            }

            return (
              <List.Item
                key={`${item.c}-${item.n}`}
                title={getFilteredValue(item, section)}
                subtitle={getFilteredSubtitle(item, section)}
                accessories={accessories}
                detail={<CharacterDetail item={item} />}
                actions={<CharacterActionPanel item={item} />}
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
});
