import { List } from "@vicinae/api";

import { useListContext } from "~/context";

export const DataSetSelector = () => {
  const { availableSets, setDatasetFilterAnd } = useListContext();

  return (
    <List.Dropdown
      tooltip="Select a character set"
      onChange={(val) => setDatasetFilterAnd(val === "null" ? null : val)}
    >
      <List.Dropdown.Item key="all" title="All" value={"null"} />
      {availableSets.map((set) => (
        <List.Dropdown.Item key={set} title={set} value={set} />
      ))}
    </List.Dropdown>
  );
};
