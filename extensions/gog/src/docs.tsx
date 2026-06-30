import { Icon } from "@vicinae/api";
import {
  WorkspaceFileList,
  WorkspaceConfig,
} from "./components/WorkspaceFileList";

const config: WorkspaceConfig = {
  service: "docs",
  mimeType: "application/vnd.google-apps.document",
  singularName: "Doc",
  pluralName: "Docs",
  icon: Icon.BlankDocument,
  exportFormats: [
    { format: "pdf", title: "PDF" },
    { format: "docx", title: "DOCX" },
    { format: "txt", title: "TXT" },
  ],
};

export default function Docs() {
  return <WorkspaceFileList config={config} />;
}
