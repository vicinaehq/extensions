import { mock } from "bun:test";

/**
 * Install the `@vicinae/api` stubs for one test file. The Vicinae runtime is
 * not available under bun test, so the surface the extension touches is
 * stubbed before the file's dynamic imports run. Call this at the top of a
 * test file, before importing modules that touch `@vicinae/api`.
 */
export function installVicinaeStubs(): VicinaeStubs {
  const state = {
    preferences: {} as Record<string, unknown>,
    spawnedCommands: [] as string[][],
  };

  const noop = () => {};
  const stubComponent = () => null;

  mock.module("@vicinae/api", () => ({
    getPreferenceValues: () => state.preferences,
    runInTerminal: async (args: string[]) => {
      state.spawnedCommands.push([...args]);
    },
    sendDesktopNotification: async () => {},
    showToast: async () => ({ hide: async () => {} }),
    confirmAlert: async () => true,
    clearSearchBar: async () => {},
    useNavigation: () => ({ push: noop, pop: noop }),
    Action: Object.assign(stubComponent, {
      SubmitForm: stubComponent,
      Open: stubComponent,
      OpenWith: stubComponent,
      Push: stubComponent,
      CopyToClipboard: stubComponent,
      Paste: stubComponent,
      Trash: stubComponent,
    }),
    ActionPanel: stubComponent,
    Alert: { ActionStyle: { Default: "default", Destructive: "destructive", Cancel: "cancel" } },
    List: Object.assign(stubComponent, {
      Dropdown: Object.assign(stubComponent, { Item: stubComponent, Section: stubComponent }),
      Item: Object.assign(stubComponent, { Detail: stubComponent }),
      Section: stubComponent,
      EmptyView: stubComponent,
    }),
    Detail: Object.assign(stubComponent, {
      Metadata: Object.assign(stubComponent, { Label: stubComponent, Separator: stubComponent }),
    }),
    Toast: { Style: { Success: "success", Failure: "failure", Animated: "animated" } },
    Icon: new Proxy({}, { get: (_target, property) => String(property) }),
  }));

  return state;
}

export interface VicinaeStubs {
  preferences: Record<string, unknown>;
  spawnedCommands: string[][];
}
