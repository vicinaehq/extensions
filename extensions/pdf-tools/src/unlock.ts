import * as path from "node:path";
import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { isPDFDocumentLocked, unlockPDF } from "./lib/qpdf";
import { getSelectedOrPickedFiles } from "./lib/selection";

export default async function Command(props: { arguments: { password: string } }) {
  try {
    const { password } = props.arguments;

    if (!password) {
      throw new Error("Password cannot be empty");
    }

    const selectedFiles = await getSelectedOrPickedFiles({
      minFiles: 1,
      multiple: true,
      title: "Select password-protected PDF file(s) to unlock",
    });

    if (selectedFiles.length === 0) {
      throw new Error("No files have been selected");
    }

    for (const filePath of selectedFiles) {
      if (path.extname(filePath).toLowerCase() !== ".pdf") {
        throw new Error("Only PDF files should be selected");
      }

      if (!(await isPDFDocumentLocked(filePath))) {
        throw new Error(`"${path.basename(filePath)}" is not password-protected`);
      }
    }

    await closeMainWindow();

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Unlocking ${selectedFiles.length} file(s)...`,
    });

    for (const filePath of selectedFiles) {
      toast.message = path.basename(filePath);
      await unlockPDF(filePath, password);
    }

    toast.style = Toast.Style.Success;
    toast.title = `PDF file${selectedFiles.length > 1 ? "s" : ""} unlocked successfully`;
    toast.message = "";
  } catch (error: any) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Unlock failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
