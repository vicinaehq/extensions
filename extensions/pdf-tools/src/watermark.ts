import * as path from "node:path";
import { closeMainWindow, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { isPDFDocumentLocked } from "./lib/qpdf";
import { getSelectedOrPickedFiles } from "./lib/selection";
import { watermarkPDF } from "./lib/watermark";

interface Preferences {
  transparency?: string;
  rotation?: string;
}

export default async function Command(props: {
  arguments: {
    text: string;
    fontSize?: string;
  };
}) {
  try {
    const { text, fontSize } = props.arguments;

    if (!text || !text.trim()) {
      throw new Error("Watermark text cannot be empty");
    }

    let transparency = 0.25;
    let rotation = 45;
    try {
      const preferences = getPreferenceValues<Preferences>();
      if (preferences.transparency) transparency = parseFloat(preferences.transparency);
      if (preferences.rotation) rotation = parseInt(preferences.rotation, 10);
    } catch {
      // defaults
    }

    const selectedFiles = await getSelectedOrPickedFiles({
      minFiles: 1,
      multiple: true,
      title: "Select PDF file(s) to watermark",
    });

    if (selectedFiles.length === 0) {
      throw new Error("No files have been selected");
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
      title: `Watermarking ${selectedFiles.length} file(s)...`,
    });

    const parsedFontSize = fontSize ? parseInt(fontSize, 10) : 72;

    for (const filePath of selectedFiles) {
      toast.message = path.basename(filePath);
      await watermarkPDF(filePath, text.trim(), transparency, rotation, parsedFontSize);
    }

    toast.style = Toast.Style.Success;
    toast.title = `PDF file${selectedFiles.length > 1 ? "s" : ""} watermarked successfully`;
    toast.message = "";
  } catch (error: any) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Watermark failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
