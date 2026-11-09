import { runOcr } from "./lib/ocr";

export default async function Command() {
  await runOcr({ mode: "fullscreen", task: "text" });
}
