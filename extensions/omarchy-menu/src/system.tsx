import { DynamicList } from ".";
import { OmarchyCheck } from "./components/OmarchyCheck";
import { system } from "./config/system";

const Command = () => {
  return (
    <OmarchyCheck>
      <DynamicList menu={system} />
    </OmarchyCheck>
  );
};

export default Command;
