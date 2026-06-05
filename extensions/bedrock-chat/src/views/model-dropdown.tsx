import { List } from "@vicinae/api";
import { getModelDisplayName, getModelIcon } from "../utils/modelInfo";

/**
 * Reusable model selection dropdown for the List search bar accessory.
 */
export function ModelDropdown({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <List.Dropdown tooltip="Select Model" value={value} onChange={onChange}>
      {options.map((option) => (
        <List.Dropdown.Item
          key={option}
          value={option}
          title={getModelDisplayName(option)}
          icon={getModelIcon(option)}
        />
      ))}
    </List.Dropdown>
  );
}
