import { Toast, showToast } from "@vicinae/api";
import { isPactlError } from "../pactl";

export async function showErrorToast(args: { title: string; error: unknown; message?: string }): Promise<void> {
  const errMsg = args.error instanceof Error ? args.error.message : String(args.error);
  const pactlHint = isPactlError(args.error) ? args.error.hint : undefined;
  const msgBase = args.message ? `${args.message}${errMsg ? `: ${errMsg}` : ""}` : errMsg;
  const msg = pactlHint ? `${msgBase}\n\n${pactlHint}` : msgBase;
  await showToast({
    style: Toast.Style.Failure,
    title: args.title,
    message: msg,
  });
}


