import * as path from "node:path";
import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { convertImagesToPDF, SUPPORTED_IMAGE_EXTENSIONS } from "./lib/images-to-pdf";
import { getSelectedOrPickedFiles } from "./lib/selection";

export default async function Command(props: { arguments: { outputFilename: string } }) {
  try {
    const { outputFilename } = props.arguments;

    if (!outputFilename || !outputFilename.trim()) {
      throw new Error("Output filename cannot be empty");
    }

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

    await closeMainWindow();

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Converting ${selectedFiles.length} image(s) to PDF...`,
    });

    const outputPath = await convertImagesToPDF(selectedFiles, outputFilename.trim());

    toast.style = Toast.Style.Success;
    toast.title = "Images converted to PDF successfully";
    toast.message = path.basename(outputPath);
  } catch (error: any) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Conversion failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
