import {getPreferenceValues, LocalStorage} from "@vicinae/api";

const STORAGE_KEY = 'searxng-previous-request';

export async function getPreviousState(): Promise<State> {
    if (!getPreferenceValues<Preferences>().keep_previous_search) {
        return {
            response: null,
            pageNumber: 1
        }
    }
    
    const previousRequestJson = await LocalStorage.getItem<string>(STORAGE_KEY);
    if (!previousRequestJson) {
        return {
            response: null,
            pageNumber: 1
        }
    }
    return JSON.parse(previousRequestJson) as State;
}

export function saveState(state: State | null): Promise<void> {
    if (!state) {
        return Promise.resolve();
    }

    const data = JSON.stringify(state);
    return LocalStorage.setItem(
        STORAGE_KEY,
        data
    )
}