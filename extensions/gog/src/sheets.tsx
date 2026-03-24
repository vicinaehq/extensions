import { Icon } from "@vicinae/api";
import {
  WorkspaceFileList,
  WorkspaceConfig,
} from "./components/WorkspaceFileList";

const config: WorkspaceConfig = {
  service: "sheets",
  mimeType: "application/vnd.google-apps.spreadsheet",
  singularName: "Sheet",
  pluralName: "Sheets",
  icon: Icon.BarChart,
  exportFormats: [
    { format: "pdf", title: "PDF" },
    { format: "xlsx", title: "XLSX" },
    { format: "csv", title: "CSV" },
  ],
};

export default function Sheets() {
  return <WorkspaceFileList config={config} />;
}
