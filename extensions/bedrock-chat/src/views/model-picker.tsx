import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { getModelDisplayName, getModelIcon } from "../utils/modelInfo";

/**
 * Full-screen model picker list, used for regenerating a response with a different model.
 * The caller provides an `onSelectModel` callback and closes over any extra state it needs.
 */
export function ModelPicker({
  options,
  currentOption,
  onSelectModel,
}: {
  options: string[];
  currentOption: string;
  onSelectModel: (option: string) => void;
}) {
  const { pop } = useNavigation();

  return (
    <List navigationTitle="Select Model to Regenerate">
      {options.map((option) => (
        <List.Item
          key={option}
          id={option}
          title={getModelDisplayName(option)}
          icon={option === currentOption ? Icon.Checkmark : getModelIcon(option)}
          accessories={option === currentOption ? [{ text: "Current" }] : []}
          actions={
            <ActionPanel>
              <Action
                title={`Regenerate with ${getModelDisplayName(option)}`}
                icon={Icon.ArrowClockwise}
                onAction={() => {
                  onSelectModel(option);
                  pop();
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
