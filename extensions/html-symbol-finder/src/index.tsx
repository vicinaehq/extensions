import { ListContextProvider } from "./context";
import { CharactersList } from "./components/list";

export default function Command() {
  return (
    <ListContextProvider>
      <CharactersList />
    </ListContextProvider>
  );
}
