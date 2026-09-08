import { Detail, type LaunchProps } from "@vicinae/api";
import { useEffect, useState } from "react";
import { errorMessage, type AICommand } from "./core/types";
import { captureSource, repository, type SourceContext } from "./vicinae";
import { plainTextMarkdown } from "./core/template";
import { RunView } from "./ui/run-view";
import { CommandForm } from "./ui/command-form";

export default function RunAICommand(
  props: LaunchProps<{ arguments: { commandId: string; action?: string } }>,
) {
  const { commandId, action } = props.arguments;
  if (action === "edit")
    return <EditCommand key={commandId} commandId={commandId} />;
  if (action) return <Detail markdown="Unknown AI command action." />;
  return <ExecuteCommand key={commandId} commandId={commandId} />;
}

function EditCommand({ commandId }: { commandId: string }) {
  const [command, setCommand] = useState<AICommand>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void repository.command(commandId).then(
      (saved) => {
        if (active) setCommand(saved);
      },
      (failure) => {
        if (active) setError(errorMessage(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [commandId]);
  if (error) return <Detail markdown={plainTextMarkdown(error)} />;
  return command ? (
    <CommandForm command={command} />
  ) : (
    <Detail markdown="Loading command…" />
  );
}

function ExecuteCommand({ commandId }: { commandId: string }) {
  const [loaded, setLoaded] = useState<{
    command: AICommand;
    context: SourceContext;
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    setLoaded(undefined);
    setError(undefined);
    void Promise.all([repository.command(commandId), captureSource()])
      .then(([command, context]) => {
        if (active) setLoaded({ command, context });
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [commandId]);
  if (error) return <Detail markdown={plainTextMarkdown(error)} />;
  return loaded ? (
    <RunView {...loaded} />
  ) : (
    <Detail markdown="Preparing your command…" />
  );
}
