import { DynamicList } from ".";
import { OmarchyCheck } from "./components/OmarchyCheck";
import { capture } from "./config/trigger";

const Command = () => {
  return (
    <OmarchyCheck>
      <DynamicList menu={capture} />
    </OmarchyCheck>
  );
};

export default Command;
