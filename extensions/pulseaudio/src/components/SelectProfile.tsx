import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { pactl, PactlCard, PactlCardProfile } from "../pactl";
import { showErrorToast } from "../ui/toasts";

export function SelectProfile(props: {
  card: PactlCard;
  onProfileChange: () => Promise<void>;
}) {
  const { card, onProfileChange } = props;
  const { pop } = useNavigation();

  async function selectProfile(profile: PactlCardProfile) {
    try {
      await pactl.setCardProfile(card.index, profile.name);
      await onProfileChange();
      pop();
    } catch (e) {
      await showErrorToast({ title: "Failed to set profile", error: e });
    }
  }

  return (
    <List
      navigationTitle="Select Profile"
      searchBarPlaceholder="Search profiles"
    >
      {card.profiles.map((profile) => {
        const isCurrent = profile.name === card.activeProfile;
        return (
          <List.Item
            key={profile.name}
            title={profile.description}
            subtitle={profile.name}
            accessories={
              isCurrent
                ? [
                    {
                      icon: Icon.Checkmark,
                      tag: {
                        color: "green",
                        value: "Current",
                      },
                    },
                  ]
                : []
            }
            actions={
              <ActionPanel>
                <Action
                  title="Select Profile"
                  icon={Icon.CheckCircle}
                  onAction={() => selectProfile(profile)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
