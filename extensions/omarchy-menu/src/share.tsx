import { DynamicList } from ".";
import { OmarchyCheck } from "./components/OmarchyCheck";
import { share } from "./config/trigger";

const Command = () => {
  return (
    <OmarchyCheck>
      <DynamicList menu={share} />
    </OmarchyCheck>
  );
};

export default Command;
