import * as path from "node:path";
import {
  convertImagesToPDF,
  ensureImageConversionAvailable,
  SUPPORTED_IMAGE_EXTENSIONS,
} from "./lib/images-to-pdf";
import { showFailure, showProgress, showSuccess } from "./lib/feedback";
import { getSelectedOrPickedFiles } from "./lib/selection";

export default async function Command(props: { arguments: { outputFilename: string } }) {
  try {
    const { outputFilename } = props.arguments;

    if (!outputFilename || !outputFilename.trim()) {
      throw new Error("Output filename cannot be empty");
    }

    await ensureImageConversionAvailable();

    const selectedFiles = await getSelectedOrPickedFiles({
      minFiles: 1,
      multiple: true,
      allowedExtensions: SUPPORTED_IMAGE_EXTENSIONS,
      filterName: "Image files",
      title: "Select image(s) to merge into PDF",
    });

    if (selectedFiles.length === 0) {
      throw new Error("No images have been selected");
    }

    await showProgress(`Converting ${selectedFiles.length} image(s) to PDF...`);

    const outputPath = await convertImagesToPDF(selectedFiles, outputFilename.trim());

    await showSuccess("Images converted to PDF successfully", path.basename(outputPath));
  } catch (error: any) {
    await showFailure("Conversion failed", error);
  }
}
