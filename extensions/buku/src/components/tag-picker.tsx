import { Action, ActionPanel, Icon, Keyboard, List, useNavigation } from "@vicinae/api";
import { type ReactNode, useMemo, useState } from "react";
import { normalizeTag } from "../lib/tags";

type TagPickerProps = {
  knownTags: string[];
  selected: string[];
  /** Fired on every change, so the caller stays in sync even if the picker is dismissed. */
  onChange: (tags: string[]) => void;
};

// Vicinae binds no named shortcut to tag picking, but "Done" is a save, so it uses the
// named one and follows whatever the user rebound it to.
const PICK_TAGS_SHORTCUT: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "t" };
const DONE_SHORTCUT = Keyboard.Shortcut.Common.Save;

/**
 * Action that opens {@link TagPicker} from a form's action panel.
 *
 * Vicinae's SDK exposes a `Form.TagPicker`, but its server parses the field and then
 * throws it away without rendering anything (`FormTagPickerFieldWire` in vicinae's
 * `model-deser.cpp` maps to an empty handler), so tags get picked in a pushed list.
 */
export function PickTagsAction(props: TagPickerProps) {
  return (
    <Action.Push title="Pick Tags" icon={Icon.Tag} shortcut={PICK_TAGS_SHORTCUT} target={<TagPicker {...props} />} />
  );
}

/**
 * Searchable list of buku's tags where each one can be toggled on and off, plus a way
 * to create a tag out of the search text.
 *
 * The selection lives here rather than in the caller because a pushed view keeps the
 * props it was created with — the caller is notified through `onChange` instead.
 */
export function TagPicker({ knownTags, selected, onChange }: TagPickerProps) {
  const { pop } = useNavigation();
  const [tags, setTags] = useState(selected);
  const [searchText, setSearchText] = useState("");

  const selectedTags = useMemo(() => new Set(tags), [tags]);
  const availableTags = useMemo(() => knownTags.filter((tag) => !selectedTags.has(tag)), [knownTags, selectedTags]);

  const query = normalizeTag(searchText);
  const isNewTag = query !== "" && !selectedTags.has(query) && !knownTags.includes(query);

  const apply = (next: string[]) => {
    setTags(next);
    onChange(next);
  };

  const toggle = (tag: string) => apply(selectedTags.has(tag) ? tags.filter((it) => it !== tag) : [...tags, tag]);

  const create = () => {
    apply([...tags, query]);
    setSearchText("");
  };

  const actions = (primary: ReactNode) => (
    <ActionPanel>
      {primary}
      <Action title="Done" icon={Icon.Check} shortcut={DONE_SHORTCUT} onAction={pop} />
      {tags.length > 0 && (
        <Action
          title="Clear All Tags"
          icon={Icon.XMarkCircle}
          style={Action.Style.Destructive}
          onAction={() => apply([])}
        />
      )}
    </ActionPanel>
  );

  return (
    <List
      navigationTitle="Pick Tags"
      searchBarPlaceholder="Filter tags, or type a new one..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering
      actions={actions(null)}
    >
      {isNewTag && (
        <List.Section title="New Tag">
          <List.Item
            icon={Icon.Plus}
            title={query}
            subtitle="Create and add this tag"
            actions={actions(<Action title="Add Tag" icon={Icon.Plus} onAction={create} />)}
          />
        </List.Section>
      )}
      <List.Section title={`Selected [${tags.length}]`}>
        {tags.map((tag) => (
          <List.Item
            key={tag}
            id={`selected-${tag}`}
            icon={Icon.CheckCircle}
            title={tag}
            actions={actions(<Action title="Remove Tag" icon={Icon.Minus} onAction={() => toggle(tag)} />)}
          />
        ))}
      </List.Section>
      <List.Section title={`Available [${availableTags.length}]`}>
        {availableTags.map((tag) => (
          <List.Item
            key={tag}
            id={`available-${tag}`}
            icon={Icon.Circle}
            title={tag}
            actions={actions(<Action title="Add Tag" icon={Icon.Plus} onAction={() => toggle(tag)} />)}
          />
        ))}
      </List.Section>
    </List>
  );
}
