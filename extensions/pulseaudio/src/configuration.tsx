import { Action, ActionPanel, Icon, Keyboard, List } from "@vicinae/api";
import { SelectProfile } from "./components/SelectProfile";
import { LoadingError } from "./components/LoadingError";
import { useAudioState } from "./hooks/useAudioState";

export default function Configuration() {
  const { audio, isLoading, refresh } = useAudioState();
  const cards = audio?.cards ?? [];

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Card Configuration"
      searchBarPlaceholder="Search cards"
    >
      {!isLoading && !audio && <LoadingError />}
      {cards.map((card) => {
        const activeProfileDescription =
          card.profiles.find((profile) => profile.name === card.activeProfile)
            ?.description ?? card.activeProfile;

        return (
          <List.Item
            key={card.index}
            title={card.displayName}
            subtitle={activeProfileDescription}
            accessories={[
              {
                text: `${card.profiles.length} profiles`,
              },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Select Profile"
                  icon={Icon.CheckCircle}
                  target={
                    <SelectProfile card={card} onProfileChange={refresh} />
                  }
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={
                    Keyboard.Shortcut.Common.Refresh as Keyboard.Shortcut.Common
                  }
                  onAction={refresh}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
