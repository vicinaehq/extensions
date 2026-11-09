import { runOcr } from "./lib/ocr";

export default async function Command() {
  await runOcr({ mode: "area", task: "text", source: "clipboard" });
}
