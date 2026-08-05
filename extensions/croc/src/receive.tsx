import { Action, ActionPanel, Form, showToast, Toast } from "@vicinae/api";
import { homedir } from "node:os";
import { useState } from "react";
import { CrocNotInstalledDetail } from "./components/croc-not-installed-detail";
import { useCrocReceive } from "./hooks/useCrocReceive";
import { isCrocInstalled } from "./utils/is-croc-installed";

export default function ReceiveCommand() {
  if (!isCrocInstalled()) return <CrocNotInstalledDetail />;

  const {
    status,
    transferProgress,
    pendingFileCount,
    transferCode,
    setTransferCode,
    receiveTransfer,
    answerPrompt,
  } = useCrocReceive();

  const [downloadDir, setDownloadDir] = useState<string[]>([homedir()]);

  const handleSubmit = async (values: Form.Values) => {
    const code = String(values.code ?? "").trim();
    const selectedDirs =
      (values.downloadDir as string[] | undefined) ?? downloadDir;
    const targetDir = selectedDirs[0] ?? homedir();

    if (!code) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Code is required",
        message: "Enter the transfer code first",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Receiving transfer",
    });

    try {
      await receiveTransfer(code, targetDir);
      toast.style = Toast.Style.Success;
      toast.title = "Receive complete";
      toast.message = "Transfer downloaded successfully";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.style = Toast.Style.Failure;
      toast.title = "Receive failed";
      toast.message = message;
    }
  };

  let title = "Receive with Croc";
  if (status === "awaiting-accept") title = "Waiting for Confirmation...";
  if (status === "receiving") title = "Receiving...";

  let description = "Enter a code to start receiving";
  if (status === "awaiting-accept") {
    description = `Waiting for your confirmation${pendingFileCount ? ` (${pendingFileCount} file${pendingFileCount === 1 ? "" : "s"})` : ""}`;
  }
  if (status === "receiving") description = "Downloading transfer";

  return (
    <Form
      actions={
        <ActionPanel>
          {status === "idle" ? (
            <Action.SubmitForm title={title} onSubmit={handleSubmit} />
          ) : (
            <>
              <Action
                title="Accept Transfer"
                onAction={() => answerPrompt("y")}
              />
              <Action
                title="Decline Transfer"
                onAction={() => answerPrompt("n")}
              />
            </>
          )}
        </ActionPanel>
      }
    >
      <Form.TextField
        id="code"
        title="Transfer Code"
        placeholder="number-word-word-word"
        value={transferCode}
        onChange={setTransferCode}
      />
      <Form.FilePicker
        id="downloadDir"
        title="Download Folder"
        value={downloadDir}
        onChange={setDownloadDir}
        canChooseFiles={false}
        canChooseDirectories
        allowMultipleSelection={false}
      />
      <Form.Description title="Status" text={description} />
      <Form.Description
        title="Transfer Progress"
        text={transferProgress || "No file progress yet"}
      />
    </Form>
  );
}
