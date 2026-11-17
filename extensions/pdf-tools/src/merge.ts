import * as path from "node:path";
import { showFailure, showProgress, showSuccess } from "./lib/feedback";
import { ensureQpdfAvailable, isPDFDocumentLocked, mergePDFs } from "./lib/qpdf";
import { getSelectedOrPickedFiles } from "./lib/selection";

export default async function Command(props: { arguments: { outputFilename: string } }) {
  try {
    const { outputFilename } = props.arguments;

    await ensureQpdfAvailable();

    const selectedFiles = await getSelectedOrPickedFiles({
      minFiles: 2,
      multiple: true,
      title: "Select at least 2 PDF files to merge",
    });

    if (selectedFiles.length < 2) {
      throw new Error("You must select at least two PDF files");
    }

    for (const filePath of selectedFiles) {
      if (path.extname(filePath).toLowerCase() !== ".pdf") {
        throw new Error("Only PDF files should be selected");
      }

      if (await isPDFDocumentLocked(filePath)) {
        throw new Error(`"${path.basename(filePath)}" is password-protected`);
      }
    }

    await showProgress("Merging PDF files...");

    const outputPath = await mergePDFs(selectedFiles, outputFilename);

    await showSuccess("PDF files merged successfully", path.basename(outputPath));
  } catch (error: any) {
    await showFailure("Merge failed", error);
  }
}
