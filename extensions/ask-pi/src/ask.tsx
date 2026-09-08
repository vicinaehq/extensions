import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  type LaunchProps,
  closeMainWindow,
  runInTerminal,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { PiRpc, type PiEvent, type PiImage, readWaylandImage, toolSummary } from "./pi";

type Props = LaunchProps<{ arguments: { prompt?: string } }>;
type Phase = "starting" | "running" | "done" | "cancelled" | "error";
type Tool = { id: string; label: string; done: boolean };

function promptWithClipboard(prompt: string, text?: string, image?: PiImage) {
  if (image) return `${prompt}\n\nThe current clipboard image is attached as additional context.`;
  if (text) return `${prompt}\n\n--- Current clipboard (additional context) ---\n${text}`;
  return `${prompt}\n\nThe current clipboard is empty.`;
}

export default function AskPi(props: Props) {
  const rpc = useRef<PiRpc | undefined>(undefined);
  const request = useRef(0);
  const cancelled = useRef(false);
  const [phase, setPhase] = useState<Phase>("starting");
  const [status, setStatus] = useState("Reading clipboard…");
  const [clipboard, setClipboard] = useState("Checking…");
  const [tools, setTools] = useState<Tool[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [sessionFile, setSessionFile] = useState("");

  const onEvent = useCallback((event: PiEvent) => {
    if (event.type === "message_update") {
      const update = event.assistantMessageEvent as { type?: string } | undefined;
      if (update?.type === "thinking_start") setStatus("Thinking…");
      if (update?.type === "text_start") setStatus("Writing answer…");
    }

    if (event.type === "tool_execution_start") {
      const id = String(event.toolCallId);
      const name = String(event.toolName);
      const label = toolSummary(name, event.args as Record<string, unknown>);
      setStatus(`Using ${name}…`);
      setTools((current) => [...current.filter((tool) => tool.id !== id), { id, label, done: false }].slice(-6));
    }

    if (event.type === "tool_execution_end") {
      const id = String(event.toolCallId);
      setTools((current) => current.map((tool) => (tool.id === id ? { ...tool, done: true } : tool)));
      setStatus("Thinking…");
    }
  }, []);

  const runPrompt = useCallback(async (client: PiRpc, prompt: string, images?: PiImage[]) => {
    const current = ++request.current;
    cancelled.current = false;
    setPhase("running");
    setStatus("Thinking…");
    setTools([]);
    setError("");

    try {
      const result = await client.prompt(prompt, images);
      if (current !== request.current) return;
      setAnswer(result || "Pi completed without a text response.");
      setStatus("Done");
      setPhase("done");
    } catch (cause) {
      if (current !== request.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Failed");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        const image = await readWaylandImage();
        const text = image ? "" : await Clipboard.readText();
        if (disposed || cancelled.current) return;

        setClipboard(image ? `Image · ${image.mimeType}` : text ? "Text" : "Empty");
        setStatus("Starting Pi…");
        const client = new PiRpc(onEvent);
        rpc.current = client;
        const state = await client.state();
        if (disposed || cancelled.current) return void client.close();
        setSessionFile(state.sessionFile || "");

        const fallback = props.fallbackText?.replace(/^\?\s*/, "").trim();
        const prompt = fallback || props.arguments?.prompt?.trim();
        if (!prompt) throw new Error("Enter a request for Pi");
        void runPrompt(client, promptWithClipboard(prompt, text, image), image ? [image] : undefined);
      } catch (cause) {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("Failed");
        setPhase("error");
      }
    })();

    return () => {
      disposed = true;
      void rpc.current?.close();
    };
  }, [onEvent, props.arguments?.prompt, props.fallbackText, runPrompt]);

  const cancel = async () => {
    cancelled.current = true;
    request.current++;
    setPhase("cancelled");
    setStatus("Cancelled");
    try {
      await rpc.current?.abort();
    } catch {
      // The process may have exited at the same time.
    }
  };

  const openInPi = async () => {
    if (!sessionFile) return;
    await rpc.current?.close();
    await runInTerminal(["pi", "--session", sessionFile], { title: "Pi" });
    await closeMainWindow();
  };

  const activity = tools.length
    ? `### Activity\n\n${tools.map((tool) => `- ${tool.done ? "✓" : "→"} ${tool.label}`).join("\n")}`
    : "_No tool calls yet._";
  const markdown =
    phase === "done"
      ? answer
      : phase === "error"
        ? `## Pi could not finish\n\n${error}`
        : `## ${status}\n\n${activity}`;

  return (
    <Detail
      navigationTitle="Pi"
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text={status} />
          <Detail.Metadata.Label title="Clipboard" text={clipboard} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {phase === "running" || phase === "starting" ? (
            <Action title="Cancel" icon={Icon.Stop} style="destructive" onAction={() => void cancel()} />
          ) : (
            <>
              {phase === "done" && <Action.CopyToClipboard title="Copy Answer" content={answer} />}
              {sessionFile && <Action title="Open in Pi" icon={Icon.Terminal} onAction={() => void openInPi()} />}
            </>
          )}
        </ActionPanel>
      }
    />
  );
}
