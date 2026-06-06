import { PackageList } from "./components";
import { listOutdatedAsync } from "./lib";
export default function Command() { return <PackageList title="Outdated Linuxbrew packages" load={listOutdatedAsync} />; }
