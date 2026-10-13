import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useMemo, useState } from "react";
import { RunResult } from "../components/RunResult";
import { type AptPackage, findAptIcon, runPrivilegedApGet, simulateAptRemove } from "../lib/apt";
import { askConfirm } from "../lib/confirm";

export type BatchActionKind = "install" | "remove" | "upgrade";

const VERB: Record<BatchActionKind, string> = {
  install: "Install",
  remove: "Remove",
  upgrade: "Upgrade",
};

function buildArgs(kind: BatchActionKind, specs: string[]): string[] {
  if (kind === "remove") return ["remove", "-y", ...specs];
  if (kind === "upgrade") return ["install", "--only-upgrade", "-y", ...specs];
  return ["install", "-y", ...specs];
}

/**
 * Identify a package by name and architecture. On multiarch systems apt lists
 * the same name once per architecture, so the name alone is ambiguous; the
 * qualified `name:arch` form is also what apt-get expects on the command line.
 */
function specOf(pkg: AptPackage): string {
  return pkg.arch ? `${pkg.name}:${pkg.arch}` : pkg.name;
}

type Props = {
  kind: BatchActionKind;
  candidates: AptPackage[];
  navigationTitle: string;
  onDone: () => void;
};

export function BatchPackages({
  kind,
  candidates,
  navigationTitle,
  onDone,
}: Props) {
  const { pop, push } = useNavigation();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);

  const verb = VERB[kind];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return candidates;
    return candidates.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(q) || pkg.arch.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const toggle = (spec: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(spec)) {
        next.delete(spec);
      } else {
        next.add(spec);
      }
      return next;
    });
  };
  const run = async () => {
    const specs = [...selected];
    if (specs.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No packages selected",
        message: "Enter and select at least one package first",
      });
      return;
    }
    if (kind === "remove") {
      const simulation = await simulateAptRemove(specs);
      if (simulation.additional.length > 0) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Removal blocked",
          message: `${simulation.additional.length} additional installed package(s) would be removed: ${simulation.additional.slice(0, 5).join(", ")}${simulation.additional.length > 5 ? ", …" : ""}`,
        });
        return;
      }
    }
    const args = buildArgs(kind, specs);
    const label = `${verb} ${specs.length.toString()} package${specs.length === 1 ? "" : "s"}`;
    const confirmed = await askConfirm(
      label,
      `Run "apt-get ${args.join(" ")}"?`,
      verb,
    );
    if (!confirmed) return;
    setRunning(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: label,
    });
    const result = await runPrivilegedApGet(args, label);
    if (result.ok) {
      toast.style = Toast.Style.Success;
      toast.title = label;
      toast.message = "Done";
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = `${label} failed`;
      toast.message =
        result.stderr.trim().slice(0, 140) ||
        `exit code ${result.code ?? "unknown"}`;
    }
    pop();
    push(
      <RunResult
        heading={label}
        title={label}
        result={result}
        sudoArgs={args}
      />,
    );
    setRunning(false);
    onDone();
  };

  return (
    <List
      navigationTitle={navigationTitle}
      isLoading={running}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search packages..."
    >
      <List.Item
        id="__done"
        title={
          selected.size > 0
            ? `${verb} ${selected.size} package${selected.size === 1 ? "" : "s"}`
            : `No packages selected (${candidates.length} available)`
        }
        icon={Icon.Bolt}
        actions={
          <ActionPanel>
            <Action
              title={selected.size > 0 ? verb : "Select packages first"}
              onAction={run}
            />
            {candidates.length > 1 && (
              <Action
                title="Select all shown packages"
                shortcut={{ modifiers: ["cmd"], key: "a" }}
                onAction={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const pkg of filtered) next.add(specOf(pkg));
                    return next;
                  })
                }
              />
            )}
          </ActionPanel>
        }
      />
      {selected.size > 0 && (
        <List.Item
          id="__clear"
          title={`Clear selection (${selected.size})`}
          icon={Icon.Eraser}
          actions={
            <ActionPanel>
              <Action
                title="Clear selection"
                onAction={() => setSelected(() => new Set())}
              />
            </ActionPanel>
          }
        />
      )}
      {filtered.map((pkg) => {
        const spec = specOf(pkg);
        const isSelected = selected.has(spec);
        return (
          <List.Item
            key={spec}
            id={spec}
            title={pkg.name}
            subtitle={pkg.version + (pkg.arch ? ` (${pkg.arch})` : "")}
            keywords={[pkg.suite]}
            icon={
              isSelected
                ? Icon.Checkmark
                : (pkg.icon ?? findAptIcon(pkg.name) ?? Icon.Box)
            }
            accessories={
              isSelected
                ? [{ tag: { color: Color.Green, value: "selected" } }]
                : []
            }
            actions={
              <ActionPanel>
                <Action
                  title={isSelected ? "Deselect" : "Select"}
                  icon={isSelected ? Icon.MinusCircle : Icon.Plus}
                  onAction={() => toggle(spec)}
                />
              </ActionPanel>
            }
          />
        );
      })}
      {filtered.length === 0 && (
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="No matching packages"
          description={
            query
              ? `No packages match "${query}".`
              : "No packages available to select."
          }
        />
      )}
    </List>
  );
}