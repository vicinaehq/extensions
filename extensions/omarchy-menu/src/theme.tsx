import { DynamicList } from ".";
import { OmarchyCheck } from "./components/OmarchyCheck";
import { theme } from "./config/style";

const Command = () => {
  return (
    <OmarchyCheck>
      <DynamicList menu={theme} />
    </OmarchyCheck>
  );
};

export default Command;
