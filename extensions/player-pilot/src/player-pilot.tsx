import { exec } from "node:child_process";
import { Action, ActionPanel, Grid, Icon, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { getAllPlayers, type PlayerInfo as PlayerInfoType } from "./utils/playerctl";

export default function PlayerInfo() {
  const [players, setPlayers] = useState<PlayerInfoType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function loadPlayers() {
      try {
        const data = await getAllPlayers();
        setPlayers(data);
        if (data.length <= 2) {
          setColumns(2);
        } else {
          setColumns(3);
        }

        // Auto-select first player if none selected
        if (data.length > 0 && !selectedPlayer) {
          setSelectedPlayer(data[0].displayName);
        }
      } catch (e) {
        console.error("Failed to load players", e);
      } finally {
        setIsLoading(false);
      }
    }

    loadPlayers();
    interval = setInterval(loadPlayers, 2000); // Update every 2 seconds
    return () => clearInterval(interval);
  }, [selectedPlayer]);

  const handlePlayerAction = (player: PlayerInfoType, action: string) => {
    const actionDisplay = action.charAt(0).toUpperCase() + action.slice(1);

    exec(`playerctl --player ${player.name} ${action}`, (err, _stdout) => {
      if (err) {
        showToast(Toast.Style.Failure, `Failed to ${actionDisplay} on ${player.displayName}`);
      } else {
        showToast(Toast.Style.Success, `${actionDisplay} executed on ${player.displayName}`);
      }
    });
  };

  if (isLoading) {
    return (
      <Grid searchBarPlaceholder="Search players...">
        <Grid.EmptyView
          title="Loading Players"
          description="Please wait while we load your media players..."
          icon={Icon.Clock}
        />
      </Grid>
    );
  }

  if (players.length === 0) {
    return (
      <Grid searchBarPlaceholder="Search players...">
        <Grid.EmptyView
          title="No Media Players Found"
          description="Make sure a media player is running and try again"
          icon={Icon.Music}
        />
      </Grid>
    );
  }

  return (
    <Grid
      searchBarPlaceholder="Search players..."
      columns={columns}
      aspectRatio="3/2"
      inset={Grid.Inset.Small}
      navigationTitle={selectedPlayer ? `Players - ${selectedPlayer}` : "Media Players"}
      onSelectionChange={setSelectedPlayer}
    >
      <Grid.Section
        title="Media Players"
        columns={columns}
        aspectRatio="3/2"
        inset={Grid.Inset.Small}
      >
        {players.map((player) => {
          const subtitle = player.metadata?.artist
            ? `${player.metadata.artist} - ${player.metadata.album ?? 'Unknown'}`
            : player.status;

          const metadataTitle = player.metadata?.title ? `- ${player.metadata.title}` : "";

          const title = `${player.status === "Playing" ? "▶️" : "⏸️"} ${player.displayName} ${metadataTitle}`;

          return (
            <Grid.Item
              key={player.name}
              id={player.displayName}
              title={title}
              subtitle={subtitle}
              content={player.metadata?.albumArt || Icon.Music}
              actions={
                <ActionPanel>
                  <Action
                    title={player.status === "Playing" ? "Pause" : "Play"}
                    icon={player.status === "Playing" ? Icon.Pause : Icon.Play}
                    onAction={() =>
                      handlePlayerAction(player, player.status === "Playing" ? "pause" : "play")
                    }
                  />
                  <Action
                    title={player.status === "Playing" ? "Next" : "Play Next"}
                    icon={Icon.Forward}
                    onAction={() => handlePlayerAction(player, "next")}
                  />
                  <Action
                    title={player.status === "Playing" ? "Previous" : "Play Previous"}
                    icon={Icon.Rewind}
                    onAction={() => handlePlayerAction(player, "previous")}
                  />
                  <Action
                    title="Stop"
                    icon={Icon.Stop}
                    onAction={() => handlePlayerAction(player, "stop")}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </Grid.Section>
    </Grid>
  );
}
