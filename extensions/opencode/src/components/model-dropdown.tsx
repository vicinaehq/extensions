import { List } from "@vicinae/api";
import { type ReactNode } from "react";
import { useModels, modelValue } from "../lib/models";
import type { Endpoint } from "../lib/opencode/discovery";

/**
 * Model dropdown for the List search bar accessory: the selected model stays
 * visible in the window and can be changed inline. Falls back to OpenCode's
 * default model when nothing is selected.
 */
export function ModelDropdown(props: {
  readonly endpoint: Endpoint;
  readonly value?: string | undefined;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const { models, defaultModelID } = useModels(props.endpoint);

  if (models.length === 0) return null;

  const firstID = models[0] ? modelValue(models[0]) : "";
  const current = props.value ?? defaultModelID ?? firstID;

  return (
    <List.Dropdown tooltip="Model" value={current} onChange={props.onChange} filtering>
      {models.map((model) => {
        const id = modelValue(model);
        return (
          <List.Dropdown.Item
            key={id}
            value={id}
            title={model.name || id}
            keywords={[id]}
          />
        );
      })}
    </List.Dropdown>
  );
}

export { modelLabel } from "./model-picker";
