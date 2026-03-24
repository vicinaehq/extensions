import { Detail, ActionPanel, Action } from "@vicinae/api";
import React from "react";
import { setupPersistConfig } from "./api/hyprlandConfig";

export const SetupGuide = ({
  setIsPersistSetup,
}: {
  setIsPersistSetup: (value: boolean) => void;
}) => {
  return (
    <Detail
      actions={
        <ActionPanel>
          <Action
            title="Open Setup Guide"
            onAction={() => {
              setupPersistConfig();
              setIsPersistSetup(true);
            }}
          />
        </ActionPanel>
      }
      markdown={`# Hyprland Monitor Setup Required
    
    Persistent monitor changes are enabled, but setup is not complete yet.
    
    Press **Enter** to let Vicinae set this up automatically.
    
    This will:
    - Create the required Hyprland config file
    - Source the config so changes apply immediately`}
    />
  );
};
