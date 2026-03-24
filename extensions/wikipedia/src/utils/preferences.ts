import { getPreferenceValues } from "@vicinae/api";

const preferences = getPreferenceValues();

export const prefersListView = preferences["viewType"] === "list";
