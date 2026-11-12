import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createContext, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createConnection } from "node:net";

test("real SDK UI: render, search, import, edit and copy never execute; reload is explicit", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "bang-ui-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const historyPath = path.join(directory, "history");
  await writeFile(historyPath, "docker compose up -d\nTOKEN=synthetic-secret echo ok\n");
  const pushed: ReactNode[] = [];
  const clipboard: unknown[] = [];
  const launchRequests: unknown[] = [];
  const dialogs: unknown[] = [];
  const payloads: string[] = [];
  const preferences = { shell: "bash", historyPath, workingDirectory: directory, reviewBeforeRun: true, confirmBeforeRun: true, saveHistory: true };
  let confirmed = false;
  const navigationContext = createContext({ push: (node: ReactNode) => { pushed.push(node); }, pop: () => {} });
  // Emulate the SDK host, not the API components. The actual @vicinae/api List,
  // Form, Actions, Clipboard and confirmAlert implementations run in this test.
  const host = globalThis as typeof globalThis & { vicinae: unknown; IS_REACT_ACT_ENVIRONMENT: boolean };
  host.IS_REACT_ACT_ENVIRONMENT = true;
  host.vicinae = {
    environ: { assetsPath: path.resolve("assets"), ownerOrAuthorName: "fooladgar" },
    preferences,
    navigationContext,
    client: {
      UI: {
        confirmAlert: async (options: unknown) => { dialogs.push(options); return confirmed; },
        showToast: async () => {},
      },
      Clipboard: { copy: async (...args: unknown[]) => { clipboard.push(args); } },
      Application: { runInTerminal: async (options: { cmdline: string[] }) => {
        launchRequests.push(options);
        // Consume local IPC like a terminal runner, but NEVER execute in this UI test.
        await new Promise<void>((resolve, reject) => {
          const socket = createConnection(options.cmdline[2]);
          const chunks: string[] = [];
          socket.on("data", chunk => chunks.push(chunk.toString()));
          socket.on("end", () => { payloads.push(chunks.join("")); resolve(); });
          socket.on("error", reject);
        });
      } },
    },
  };
  const { default: Bang } = await import("../src/bang");
  const { LaunchType } = await import("@vicinae/api");
  let view: ReactTestRenderer;
  await act(async () => { view = create(React.createElement(Bang, { launchType: LaunchType.UserInitiated, arguments: {} })); });
  t.after(async () => { await act(async () => view.unmount()); });
  // Wait only for the async snapshot (no timing-sensitive fixed sleep).
  for (let i = 0; i < 100 && view!.root.findByType("list" as never).props.isLoading; i++) {
    await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  }
  assert.equal(view!.root.findByType("list" as never).props.isLoading, false);
  assert.doesNotMatch(JSON.stringify(view!.toJSON()), /synthetic-secret/);
  assert.equal(launchRequests.length, 0);
  assert.equal(dialogs.length, 0);

  // Changing the file and searching must not trigger a read; only Reload does.
  await writeFile(historyPath, "echo replaced\n");
  await act(async () => { view.root.findByType("list" as never).props.onSearchTextChange("dck cmp"); });
  const historyItem = view!.root.findAllByType("list-item" as never).find(item => item.props.id === "history-0")!;
  assert.equal(historyItem.props.title, "<b></b><b><u>d</u></b>o<b><u>ck</u></b>er<b><u>&nbsp;c</u></b>o<b><u>mp</u></b>ose&nbsp;up&nbsp;-d");
  assert.equal(view!.root.findByType("list" as never).props.filtering, false);
  assert.equal(launchRequests.length, 0);
  const actions = () => view!.root.findAllByType("action" as never);
  await act(async () => { await actions().find(action => action.props.title === "Copy Command")!.props.onAction(); });
  assert.equal(clipboard.length, 1);
  assert.deepEqual(clipboard[0], [{ text: "docker compose up -d" }, { concealed: true }]);
  assert.equal(launchRequests.length, 0);

  await act(async () => { actions().find(action => action.props.title === "Review and Edit Command")!.props.onAction(); });
  assert.equal(pushed.length, 1);
  await act(async () => { view.update(pushed[0] as React.ReactElement); });
  const text = view!.root.findByType("text-area-field" as never);
  assert.equal(text.props.storeValue, false);
  assert.equal(text.props.value.value, "docker compose up -d");
  await act(async () => { text.props.onChange("echo edited"); });
  assert.equal(launchRequests.length, 0);
  await act(async () => { await actions().find(action => action.props.title === "Run in Terminal…")!.props.onAction(); });
  assert.equal(dialogs.length, 1);
  assert.equal(launchRequests.length, 0); // canceled confirmation

  // Fresh mount re-reads only on open/reload; no-match input is preserved literally.

  await act(async () => { view.update(React.createElement(Bang, { launchType: LaunchType.UserInitiated, arguments: {}, fallbackText: "!literal-new-command" })); });
  for (let i = 0; i < 100 && view!.root.findByType("list" as never).props.isLoading; i++) {
    await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  }
  assert.equal(view!.root.findByType("list" as never).props.searchText.value, "!literal-new-command");
  assert.ok(JSON.stringify(view!.toJSON()).includes("No Matches"));
  assert.equal(launchRequests.length, 0);
  await act(async () => { actions().find(action => action.props.title === "Review and Edit Command")!.props.onAction(); });
  await act(async () => { view.update(pushed[1] as React.ReactElement); });
  await act(async () => { view.root.findByType("text-area-field" as never).props.onChange("echo synthetic-new-command"); });
  confirmed = true;
  await act(async () => { await actions().find(action => action.props.title === "Run in Terminal…")!.props.onAction(); });
  assert.equal(launchRequests.length, 1);
  assert.doesNotMatch(JSON.stringify(launchRequests), /synthetic-new-command/);
  assert.equal(JSON.parse(payloads[0]).command, "echo synthetic-new-command");
  assert.equal(JSON.parse(payloads[0]).waitForApproval, true);
  assert.deepEqual(JSON.parse(payloads[0]).history, { path: historyPath, shell: "bash" });

  await writeFile(historyPath, "TOKEN=synthetic-secret echo ok\n");
  await act(async () => { view.update(React.createElement(Bang, { launchType: LaunchType.UserInitiated, arguments: {} })); });
  for (let i = 0; i < 100 && view!.root.findByType("list" as never).props.isLoading; i++) {
    await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  }
  confirmed = false;
  await act(async () => { view.root.findByType("list" as never).props.onSearchTextChange("synthetic-secret"); });
  assert.equal(view!.root.findAllByType("list-item" as never).find(item => item.props.id === "history-0")!.props.title, "Sensitive command — review to reveal");
  await act(async () => { view.root.findByType("list" as never).props.onSearchTextChange(""); });
  await act(async () => { await actions().find(action => action.props.title === "Copy Command")!.props.onAction(); });
  assert.equal(clipboard.length, 1); // sensitive copy canceled
  confirmed = true;
  await act(async () => { await actions().find(action => action.props.title === "Copy Command")!.props.onAction(); });
  assert.equal(clipboard.length, 2);
  assert.deepEqual(clipboard[1], [{ text: "TOKEN=synthetic-secret echo ok" }, { concealed: true }]);
  await writeFile(historyPath, "echo refreshed\n");
  await act(async () => { actions().find(action => action.props.title === "Reload History")!.props.onAction(); });
  for (let i = 0; i < 100 && view!.root.findByType("list" as never).props.isLoading; i++) {
    await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  }
  assert.ok(JSON.stringify(view!.toJSON()).includes("echo&nbsp;refreshed"));
  assert.equal(launchRequests.length, 1);

  // Turning review off changes the PRIMARY action, not the confirmation gate.
  preferences.reviewBeforeRun = false;
  preferences.saveHistory = false;
  await act(async () => { actions().find(action => action.props.title === "Reload History")!.props.onAction(); });
  for (let i = 0; i < 100 && view!.root.findByType("list" as never).props.isLoading; i++) {
    await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  }
  const runAction = actions().find(action => action.props.title === "Run in Terminal…")!;
  const editAction = actions().find(action => action.props.title === "Review and Edit Command")!;
  assert.ok(actions().indexOf(runAction) < actions().indexOf(editAction));
  const previousPushes = pushed.length;
  confirmed = false;
  await act(async () => { await runAction.props.onAction(); });
  assert.equal(pushed.length, previousPushes);
  assert.equal(launchRequests.length, 1);
  confirmed = true;
  await act(async () => { await runAction.props.onAction(); });
  assert.equal(pushed.length, previousPushes);
  assert.equal(launchRequests.length, 2);
  assert.equal(JSON.parse(payloads[1]).command, "echo refreshed");
  assert.equal(JSON.parse(payloads[1]).history, undefined);
  await act(async () => { editAction.props.onAction(); });
  assert.equal(pushed.length, previousPushes + 1); // editing still available

  preferences.confirmBeforeRun = false;
  await act(async () => { actions().find(action => action.props.title === "Reload History")!.props.onAction(); });
  for (let i = 0; i < 100 && view!.root.findByType("list" as never).props.isLoading; i++) {
    await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  }
  const dialogCount = dialogs.length;
  confirmed = false; // If a dialog is incorrectly shown it would prevent launch.
  await act(async () => { view.root.findByType("list" as never).props.onSearchTextChange("echo direct-new-command"); });
  assert.equal(launchRequests.length, 2); // typing still cannot execute
  assert.equal(dialogs.length, dialogCount);
  await act(async () => { await actions().find(action => action.props.title === "Run in Terminal…")!.props.onAction(); });
  assert.equal(dialogs.length, dialogCount);
  assert.equal(launchRequests.length, 3);
  assert.equal(JSON.parse(payloads[2]).command, "echo direct-new-command");
  assert.equal(pushed.length, previousPushes + 1); // no editor was opened

  // New-command titles are escaped, but action payloads remain literal input.
  const literal = 'echo "<img src=https://example.invalid/x>" & true';
  await act(async () => { view.root.findByType("list" as never).props.onSearchTextChange(literal); });
  const newItem = view!.root.findAllByType("list-item" as never).find(item => item.props.id === "new-command")!;
  assert.equal(newItem.props.title, "<b></b>echo&nbsp;&quot;&lt;img&nbsp;src=https://example.invalid/x&gt;&quot;&nbsp;&amp;&nbsp;true");
  await act(async () => { await actions().find(action => action.props.title === "Copy Command")!.props.onAction(); });
  assert.deepEqual(clipboard.at(-1), [{ text: literal }, { concealed: true }]);
  assert.equal(launchRequests.length, 3);

  // Alias setup is separate from execution, opt-in, and always confirmed.
  const configPath = path.join(directory, "settings.json");
  const original = '// synthetic config\n{"private":"synthetic-config-secret"}\n';
  await writeFile(configPath, original);
  const beforeSetup = await readdir(directory);
  await act(async () => { actions().find(action => action.props.title === "Set Up ! Alias…")!.props.onAction(); });
  await act(async () => { view.update(pushed.at(-1) as React.ReactElement); });
  await act(async () => { view.root.findByType("text-field" as never).props.onChange(configPath); });
  assert.deepEqual(await readdir(directory), beforeSetup); // opening/rendering does nothing
  assert.equal(await readFile(configPath, "utf8"), original);
  confirmed = false;
  await act(async () => { await actions().find(action => action.props.title === "Set Up ! Alias…")!.props.onAction(); });
  assert.equal(await readFile(configPath, "utf8"), original);
  assert.deepEqual(await readdir(directory), beforeSetup); // cancel creates no backup
  confirmed = true;
  await act(async () => { await actions().find(action => action.props.title === "Set Up ! Alias…")!.props.onAction(); });
  assert.match(await readFile(configPath, "utf8"), /"alias": "!"/);
  const backups = (await readdir(directory)).filter(name => name.includes(".bang-backup-"));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(path.join(directory, backups[0]), "utf8"), original);
  assert.doesNotMatch(JSON.stringify(view!.toJSON()), /synthetic-config-secret/);
  assert.equal(launchRequests.length, 3); // alias setup never runs a command
});
