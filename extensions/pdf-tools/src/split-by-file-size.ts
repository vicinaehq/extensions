import * as path from "node:path";
import { getPreferenceValues } from "@vicinae/api";
import { showFailure, showProgress, showSuccess } from "./lib/feedback";
import { ensureQpdfAvailable, isPDFDocumentLocked, splitByFileSize } from "./lib/qpdf";
import { getSelectedOrPickedFiles } from "./lib/selection";

interface Preferences {
  suffix?: string;
}

export default async function Command(props: { arguments: { maxSizeMB: string } }) {
  try {
    const maxSizeMB = parseFloat(props.arguments.maxSizeMB);

    if (isNaN(maxSizeMB) || maxSizeMB <= 0) {
      throw new Error("A positive number is required for max file size");
    }

    await ensureQpdfAvailable();

    const selectedFiles = await getSelectedOrPickedFiles({
      minFiles: 1,
      multiple: true,
      title: "Select PDF file(s) to split by size",
    });

    if (selectedFiles.length === 0) {
      throw new Error("You must select at least one PDF file");
    }

    for (const filePath of selectedFiles) {
      if (path.extname(filePath).toLowerCase() !== ".pdf") {
        throw new Error("Only PDF files should be selected");
      }

      if (await isPDFDocumentLocked(filePath)) {
        throw new Error(`"${path.basename(filePath)}" is password-protected`);
      }
    }

    let suffix = "part";
    try {
      const preferences = getPreferenceValues<Preferences>();
      if (preferences.suffix && preferences.suffix.trim()) {
        suffix = preferences.suffix.trim();
      }
    } catch {
      // default "part"
    }

    await showProgress(`Splitting ${selectedFiles.length} file(s)...`);

    let totalParts = 0;
    for (const filePath of selectedFiles) {
      const parts = await splitByFileSize(filePath, maxSizeMB, suffix);
      totalParts += parts.length;
    }

    await showSuccess(
      `PDF file${selectedFiles.length > 1 ? "s" : ""} split successfully`,
      `Generated ${totalParts} part(s)`
    );
  } catch (error: any) {
    await showFailure("Split failed", error);
  }
}
