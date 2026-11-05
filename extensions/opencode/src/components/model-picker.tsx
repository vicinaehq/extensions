import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { type ReactNode } from "react";import { useModels, modelValue } from "../lib/models";
import type { Endpoint } from "../lib/opencode/discovery";
import type { ModelRef } from "../lib/opencode/types";

/** Friendly display name for a model. */
export function modelLabel(model: { readonly name?: string; readonly providerID: string; readonly id: string }): string {
  return model.name || `${model.providerID}/${model.id}`;
}

/** Model picker backed by the official model API. Used inside advanced actions. */
export function ModelPickerList(props: {
  readonly endpoint: Endpoint;
  readonly onPick: (model: ModelRef) => void;
}): ReactNode {
  const { pop } = useNavigation();
  const { models, defaultModelID, failed, loaded } = useModels(props.endpoint);

  if (failed) {
    return (
      <List navigationTitle="Choose Model">
        <List.EmptyView title="Models could not be loaded." description="Check that OpenCode is running." />
      </List>
    );
  }

  if (loaded && models.length === 0) {
    return (
      <List navigationTitle="Choose Model">
        <List.EmptyView title="No models configured." description="Add a provider in OpenCode first." />
      </List>
    );
  }

  return (
    <List
      isLoading={!loaded}
      filtering
      searchBarPlaceholder="Search models"
      navigationTitle="Choose Model"
    >
      {models.map((model) => {
        const ref: ModelRef = { providerID: model.providerID, id: model.id };
        const id = modelValue(model);
        return (
          <List.Item
            key={id}
            id={id}
            title={model.name || id}
            subtitle={id}
            icon={id === defaultModelID ? Icon.CircleProgress100 : Icon.Circle}
            keywords={[id]}
            actions={
              <ActionPanel>
                <Action
                  title="Use This Model"
                  onAction={() => {
                    props.onPick(ref);
                    pop();
                  }}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
