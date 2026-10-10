export interface PastePort {
  sourceExists(id: string): Promise<boolean>;
  close(): Promise<void>;
  focus(id: string): Promise<boolean>;
  activeWindowId(): Promise<string | undefined>;
  paste(text: string): Promise<void>;
}

export async function pasteResult(
  text: string,
  sourceId: string | undefined,
  port: PastePort,
): Promise<void> {
  if (!text.trim()) throw new Error("There is no completed text to paste.");
  if (sourceId && !(await port.sourceExists(sourceId)))
    throw new Error("The source window has closed. Copy the result instead.");
  await port.close();
  if (sourceId) {
    if (!(await port.focus(sourceId)))
      throw new Error(
        "Could not focus the source window. The result has not been pasted.",
      );
    // Window focus is asynchronous on Wayland. Check the target before injecting a paste.
    let focused = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await port.activeWindowId()) === sourceId) {
        focused = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!focused)
      throw new Error(
        "The source window did not regain focus. Copy the result instead.",
      );
  }
  await port.paste(text);
}
