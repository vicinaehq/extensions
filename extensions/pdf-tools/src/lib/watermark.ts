import * as fs from "node:fs";
import * as path from "node:path";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";

export async function watermarkPDF(
  filePath: string,
  text: string,
  transparency: number,
  rotation: number,
  fontSize: number = 72
): Promise<string> {
  const existingPdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    // Calculate rotation in radians
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Page center
    const centerX = width / 2;
    const centerY = height / 2;

    // In pdf-lib, drawText rotates the text around its origin (x, y).
    // The center of text relative to origin is:
    // cx' = (textWidth / 2) * cos - (textHeight / 2) * sin
    // cy' = (textWidth / 2) * sin + (textHeight / 2) * cos
    // To position the rotated center at (centerX, centerY):
    const x = centerX - (textWidth / 2) * cos + (textHeight / 2) * sin;
    const y = centerY - (textWidth / 2) * sin - (textHeight / 2) * cos;

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      opacity: Math.max(0.01, Math.min(1.0, transparency)),
      rotate: degrees(rotation),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  // Generate a collision-free output file path to avoid silent overwrites
  let outputPath = path.join(dir, `${baseName} [watermarked]${ext}`);
  if (fs.existsSync(outputPath)) {
    let counter = 1;
    while (fs.existsSync(path.join(dir, `${baseName} [watermarked] (${counter})${ext}`))) {
      counter++;
    }
    outputPath = path.join(dir, `${baseName} [watermarked] (${counter})${ext}`);
  }

  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
}
