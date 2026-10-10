import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Form,
  showToast,
  Toast,
} from "@vicinae/api";
import { CrocNotInstalledDetail } from "./components/croc-not-installed-detail";
import { useCrocSend } from "./hooks/useCrocSend";
import { isCrocInstalled } from "./utils/is-croc-installed";

export default function SendCommand() {
  if (!isCrocInstalled()) return <CrocNotInstalledDetail />;

  const { status, transferCode, transferProgress, sendFiles, files, setFiles } =
    useCrocSend();

  const handleSubmit = async () => {
    if (files.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No file selected",
        message: "Pick at least one file or folder",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Waiting for receiver",
    });

    try {
      const { completion } = sendFiles();
      await completion;

      setFiles([]);

      toast.style = Toast.Style.Success;
      toast.title = "Transfer finished";
      toast.message = "File sending completed";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.style = Toast.Style.Failure;
      toast.title = "Transfer failed";
      toast.message = message;
    }
  };

  let description = "idle";
  if (status === "waiting-for-receiver") description = "Waiting for receiver";
  if (status === "sending") description = "Sending";
  if (status === "transfer-complete") description = "Transfer complete";

  return (
    <Form
      actions={
        <ActionPanel>
          {status === "idle" || status === "transfer-complete" ? (
            <Action.SubmitForm title="Send with Croc" onSubmit={handleSubmit} />
          ) : (
            <>
              <Action title="Cancel Sending" onAction={closeMainWindow} />
              <Action
                title="Copy Transfer Code"
                onAction={() => {
                  Clipboard.copy(transferCode ?? "");
                }}
              />
            </>
          )}
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="files"
        title="Files or Folders"
        value={files}
        onChange={setFiles}
        canChooseDirectories
        allowMultipleSelection={true}
      />
      <Form.Description title="Status" text={description} />
      <Form.Description
        title="Code"
        text={transferCode ?? "Waiting for code phrase..."}
      />
      <Form.Description
        title="Transfer Progress"
        text={transferProgress || "No file progress yet"}
      />
    </Form>
  );
}
