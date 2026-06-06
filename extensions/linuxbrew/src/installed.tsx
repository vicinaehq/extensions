import { PackageList } from "./components";
import { listInstalledAsync } from "./lib";
export default function Command() { return <PackageList title="Installed Linuxbrew packages" load={listInstalledAsync} />; }
