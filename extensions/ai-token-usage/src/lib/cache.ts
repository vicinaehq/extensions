import { Cache } from "@vicinae/api";
import type { LimitsSnapshot } from "./limits";
import type { ProjectsSnapshot } from "./projects";
import type { Snapshot } from "./usage";

const cache = new Cache();

function load<T>(key: string): T | null {
	const raw = cache.get(key);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export const loadSnapshot = () => load<Snapshot>("snapshot-v2");
export const saveSnapshot = (s: Snapshot) => cache.set("snapshot-v2", JSON.stringify(s));
export const loadLimits = () => load<LimitsSnapshot>("limits-v1");
export const saveLimits = (s: LimitsSnapshot) => cache.set("limits-v1", JSON.stringify(s));
export const loadProjects = () => load<ProjectsSnapshot>("projects-v1");
export const saveProjects = (s: ProjectsSnapshot) => cache.set("projects-v1", JSON.stringify(s));
