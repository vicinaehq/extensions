import { Icon } from "@vicinae/api";
import {
  WorkspaceFileList,
  WorkspaceConfig,
} from "./components/WorkspaceFileList";

const config: WorkspaceConfig = {
  service: "slides",
  mimeType: "application/vnd.google-apps.presentation",
  singularName: "Presentation",
  pluralName: "Presentations",
  icon: Icon.AppWindowGrid2x2,
  exportFormats: [
    { format: "pdf", title: "PDF" },
    { format: "pptx", title: "PPTX" },
  ],
};

export default function Slides() {
  return <WorkspaceFileList config={config} />;
}
