import * as path from "node:path";
import { showFailure, showProgress, showSuccess } from "./lib/feedback";
import { ensureQpdfAvailable, isPDFDocumentLocked, protectPDF } from "./lib/qpdf";
import { getSelectedOrPickedFiles } from "./lib/selection";

export default async function Command(props: { arguments: { password: string } }) {
  try {
    const { password } = props.arguments;

    if (!password) {
      throw new Error("Password cannot be empty");
    }

    await ensureQpdfAvailable();

    const selectedFiles = await getSelectedOrPickedFiles({
      minFiles: 1,
      multiple: true,
      title: "Select PDF file(s) to protect with password",
    });

    if (selectedFiles.length === 0) {
      throw new Error("No files have been selected");
    }

    for (const filePath of selectedFiles) {
      if (path.extname(filePath).toLowerCase() !== ".pdf") {
        throw new Error("Only PDF files should be selected");
      }

      if (await isPDFDocumentLocked(filePath)) {
        throw new Error(`"${path.basename(filePath)}" is already password-protected`);
      }
    }

    await showProgress(`Protecting ${selectedFiles.length} file(s)...`);

    for (const filePath of selectedFiles) {
      await protectPDF(filePath, password);
    }

    await showSuccess(`PDF file${selectedFiles.length > 1 ? "s" : ""} protected successfully`);
  } catch (error: any) {
    await showFailure("Protection failed", error);
  }
}
