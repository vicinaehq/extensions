import { closeMainWindow } from "@vicinae/api";
import { spawn } from "node:child_process";

export default () => {
    closeMainWindow();
    spawn(`gnome-control-center`, ["sound"]);
}
