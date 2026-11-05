import * as path from "node:path";
import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { isPDFDocumentLocked, mergePDFs } from "./lib/qpdf";
import { getSelectedOrPickedFiles } from "./lib/selection";

export default async function Command(props: { arguments: { outputFilename: string } }) {
  try {
    const { outputFilename } = props.arguments;

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

    await closeMainWindow();

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Merging PDF files...",
    });

    const outputPath = await mergePDFs(selectedFiles, outputFilename);

    toast.style = Toast.Style.Success;
    toast.title = "PDF files merged successfully";
    toast.message = path.basename(outputPath);
  } catch (error: any) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Merge failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
