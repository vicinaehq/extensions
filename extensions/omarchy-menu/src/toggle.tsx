import { DynamicList } from ".";
import { OmarchyCheck } from "./components/OmarchyCheck";
import { toggle } from "./config/trigger";

const Command = () => {
  return (
    <OmarchyCheck>
      <DynamicList menu={toggle} />
    </OmarchyCheck>
  );
};

export default Command;
