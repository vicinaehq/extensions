import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import path from "path";
import { useEffect, useMemo, useState } from "react";

import { useTags } from "@/hooks/useTags";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Tag } from "@/types";
import { listItemId } from "@/utils/paths";
import { projectListIcon } from "@/utils/projectDisplay";
import { projectsWithTag, TAG_COLORS } from "@/utils/tags";

/** Settings list row — reads live tags from the parent Settings render. */
export default function TagsSettings({
  projectTags,
  tags,
}: {
  projectTags: Record<string, string[]>;
  tags: Tag[];
}) {
  const usageCount = (tagId: string) =>
    Object.values(projectTags).reduce((sum, ids) => sum + (ids.includes(tagId) ? 1 : 0), 0);

  return (
    <List.Item
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Tags">
            <Action.Push icon={Icon.Tag} target={<TagsManagerView />} title="Manage Tags" />
            <Action.Push icon={Icon.Plus} target={<CreateTagForm />} title="Create Tag" />
          </ActionPanel.Section>
        </ActionPanel>
      }
      detail={
        <List.Item.Detail
          markdown="Tags are global. Open **Manage Tags** to create, edit, or delete them. Assign tags to projects from each project’s action panel, then filter by tag in the main list."
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Tags" text={`${tags.length} in catalog`} />
              <List.Item.Detail.Metadata.Label
                title="Assignments"
                text={`${Object.keys(projectTags).length} project${Object.keys(projectTags).length === 1 ? "" : "s"} tagged`}
              />
              {tags.slice(0, 8).map((tag) => (
                <List.Item.Detail.Metadata.TagList key={tag.id} title={tag.name}>
                  <List.Item.Detail.Metadata.TagList.Item
                    color={tag.color as Color}
                    text={`${usageCount(tag.id)} project${usageCount(tag.id) === 1 ? "" : "s"}`}
                  />
                </List.Item.Detail.Metadata.TagList>
              ))}
            </List.Item.Detail.Metadata>
          }
        />
      }
      icon={Icon.Tag}
      id="tags"
      keywords={["tag", "label", "group", "category"]}
      title="Tags"
    />
  );
}

/**
 * Pushed views must subscribe via useTags() directly.
 * Context from WorkspaceProvider often does not re-render navigation stack screens.
 */
function TagsManagerView() {
  const { createTag, deleteTag, projectTags, tags, updateTag } = useTags();

  const usageCount = (tagId: string) =>
    Object.values(projectTags).reduce((sum, ids) => sum + (ids.includes(tagId) ? 1 : 0), 0);

  const removeTag = async (tag: Tag) => {
    if (
      !(await confirmAlert({
        message: `Delete “${tag.name}”? It will be removed from all projects.`,
        primaryAction: { style: Alert.ActionStyle.Destructive, title: "Delete Tag" },
        title: "Delete Tag",
      }))
    ) {
      return;
    }

    await deleteTag(tag.id);
    await showToast({ style: Toast.Style.Success, title: `Deleted ${tag.name}` });
  };

  return (
    <List
      isShowingDetail
      // Remount section children when the catalog changes so the host list never keeps stale rows.
      key={`tags-${tags.map((tag) => `${tag.id}:${tag.name}:${tag.color}`).join("|")}`}
      navigationTitle="Manage Tags"
      searchBarPlaceholder="Search tags..."
    >
      <List.Section title="Actions">
        <List.Item
          actions={
            <ActionPanel>
              <Action.Push icon={Icon.Plus} target={<CreateTagForm />} title="Create Tag" />
            </ActionPanel>
          }
          icon={Icon.Plus}
          subtitle="Add a global tag"
          title="Create Tag"
        />
      </List.Section>
      <List.Section title={`Catalog (${tags.length})`}>
        {tags.length === 0 ? (
          <List.Item
            actions={
              <ActionPanel>
                <Action.Push icon={Icon.Plus} target={<CreateTagForm />} title="Create Tag" />
              </ActionPanel>
            }
            icon={Icon.Minus}
            subtitle="Create a tag to get started"
            title="No tags yet"
          />
        ) : (
          tags.map((tag) => (
            <List.Item
              key={tag.id}
              accessories={[{ tag: { color: tag.color as Color, value: tag.name } }]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section title="Projects">
                    <Action.Push
                      icon={Icon.BulletPoints}
                      shortcut={{ key: "a", modifiers: ["cmd"] }}
                      target={<BulkAssignTagView tagId={tag.id} />}
                      title="Assign Projects…"
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section title="Edit">
                    <Action.Push
                      icon={Icon.Pencil}
                      shortcut={{ key: "e", modifiers: ["cmd"] }}
                      target={<EditTagForm tagId={tag.id} />}
                      title="Edit Tag"
                    />
                    <Action.Push icon={Icon.Plus} target={<CreateTagForm />} title="Create Tag" />
                  </ActionPanel.Section>
                  <ActionPanel.Section title="Danger Zone">
                    <Action
                      icon={Icon.Trash}
                      onAction={() => removeTag(tag)}
                      shortcut={{ key: "backspace", modifiers: ["cmd"] }}
                      style={Action.Style.Destructive}
                      title="Delete Tag"
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
              detail={
                <List.Item.Detail
                  markdown={`**${tag.name}**\n\nAssigned to **${usageCount(tag.id)}** project${usageCount(tag.id) === 1 ? "" : "s"}.\n\nUse **Assign Projects…** to bulk-add or remove this tag across projects.`}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title="Name" text={tag.name} />
                      <List.Item.Detail.Metadata.TagList title="Color">
                        <List.Item.Detail.Metadata.TagList.Item color={tag.color as Color} text={tag.color} />
                      </List.Item.Detail.Metadata.TagList>
                      <List.Item.Detail.Metadata.Label title="Projects" text={String(usageCount(tag.id))} />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              icon={Icon.Tag}
              keywords={[tag.name, tag.id, "edit", "delete"]}
              subtitle={`${usageCount(tag.id)} project${usageCount(tag.id) === 1 ? "" : "s"}`}
              title={tag.name}
            />
          ))
        )}
      </List.Section>
    </List>
  );
}

function BulkAssignTagView({ tagId }: { tagId: string }) {
  const { projectTags, syncTagProjects, tags } = useTags();
  const { isLoading, projects } = useWorkspace();
  const { pop } = useNavigation();
  const tag = tags.find((entry) => entry.id === tagId);

  const [selected, setSelected] = useState(() => new Set(projectsWithTag(projectTags, tagId)));
  const [workspaceRoot, setWorkspaceRoot] = useState("all");

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name) || a.fullPath.localeCompare(b.fullPath)),
    [projects],
  );

  const workspaceRoots = useMemo(() => {
    const roots = [...new Set(sortedProjects.map((project) => project.parentFolder))];
    return roots.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  }, [sortedProjects]);

  useEffect(() => {
    if (workspaceRoot !== "all" && !workspaceRoots.includes(workspaceRoot)) {
      setWorkspaceRoot("all");
    }
  }, [workspaceRoot, workspaceRoots]);

  const filteredProjects = useMemo(
    () =>
      workspaceRoot === "all"
        ? sortedProjects
        : sortedProjects.filter((project) => project.parentFolder === workspaceRoot),
    [sortedProjects, workspaceRoot],
  );

  const byWorkspace = useMemo(() => {
    const groups = new Map<string, typeof filteredProjects>();
    for (const project of filteredProjects) {
      const list = groups.get(project.parentFolder) ?? [];
      list.push(project);
      groups.set(project.parentFolder, list);
    }
    return [...groups.entries()].sort(([a], [b]) => path.basename(a).localeCompare(path.basename(b)));
  }, [filteredProjects]);

  if (!tag) {
    return (
      <List navigationTitle="Assign Projects">
        <List.EmptyView
          actions={
            <ActionPanel>
              <Action icon={Icon.ArrowLeft} onAction={pop} title="Go Back" />
            </ActionPanel>
          }
          description="This tag no longer exists."
          title="Tag not found"
        />
      </List>
    );
  }

  const toggle = (projectPath: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(projectPath)) {
        next.delete(projectPath);
      } else {
        next.add(projectPath);
      }
      return next;
    });
  };

  /** Limited to the workspace filter; text search is applied by Vicinae on top. */
  const selectAllFiltered = () =>
    setSelected((current) => {
      const next = new Set(current);
      for (const project of filteredProjects) {
        next.add(project.fullPath);
      }
      return next;
    });
  const clearFiltered = () =>
    setSelected((current) => {
      const next = new Set(current);
      for (const project of filteredProjects) {
        next.delete(project.fullPath);
      }
      return next;
    });

  const save = async () => {
    await syncTagProjects(tagId, [...selected]);
    await showToast({
      message: `${selected.size} project${selected.size === 1 ? "" : "s"}`,
      style: Toast.Style.Success,
      title: `Updated ${tag.name}`,
    });
    pop();
  };

  return (
    <List
      isLoading={isLoading && projects.length === 0}
      navigationTitle={`Assign · ${tag.name} · ${selected.size} selected`}
      searchBarAccessory={
        <List.Dropdown onChange={setWorkspaceRoot} tooltip="Workspace" value={workspaceRoot}>
          <List.Dropdown.Item icon={Icon.BulletPoints} title="All Workspaces" value="all" />
          {workspaceRoots.map((root) => (
            <List.Dropdown.Item icon={Icon.Folder} key={root} title={path.basename(root)} value={root} />
          ))}
        </List.Dropdown>
      }
      searchBarPlaceholder="Search projects…"
    >
      <List.Section title={`${selected.size} selected · ${filteredProjects.length} shown`}>
        <List.Item
          actions={
            <ActionPanel>
              <Action icon={Icon.Check} onAction={save} shortcut={{ key: "s", modifiers: ["cmd"] }} title="Save Assignments" />
              <Action icon={Icon.CheckList} onAction={selectAllFiltered} title="Select All Shown" />
              <Action icon={Icon.XMarkCircle} onAction={clearFiltered} title="Clear Selection" />
            </ActionPanel>
          }
          icon={{ source: Icon.Tag, tintColor: tag.color as Color }}
          subtitle={
            workspaceRoot === "all"
              ? "Toggle projects below, then save"
              : `Only ${path.basename(workspaceRoot)} · toggle, then save`
          }
          title="Save Assignments"
        />
      </List.Section>

      {sortedProjects.length === 0 && !isLoading ? (
        <List.EmptyView
          description="Add workspace folders and refresh so projects appear here."
          title="No Projects Found"
        />
      ) : byWorkspace.length === 0 ? (
        <List.EmptyView
          description="Pick another workspace to see its projects."
          title="No Projects in This Workspace"
        />
      ) : (
        byWorkspace.map(([workspacePath, workspaceProjects]) => (
          <List.Section key={workspacePath} title={path.basename(workspacePath)}>
            {workspaceProjects.map((project) => {
              const isSelected = selected.has(project.fullPath);
              const workspaceName = path.basename(project.parentFolder);
              return (
                <List.Item
                  key={listItemId(project.fullPath)}
                  accessories={[
                    {
                      icon: isSelected ? Icon.CheckCircle : Icon.Circle,
                      tooltip: isSelected ? "Selected" : "Not selected",
                    },
                  ]}
                  actions={
                    <ActionPanel>
                      <Action
                        icon={isSelected ? Icon.XMarkCircle : Icon.CheckCircle}
                        onAction={() => toggle(project.fullPath)}
                        title={isSelected ? "Deselect Project" : "Select Project"}
                      />
                      <Action
                        icon={Icon.Check}
                        onAction={save}
                        shortcut={{ key: "s", modifiers: ["cmd"] }}
                        title="Save Assignments"
                      />
                      <Action icon={Icon.CheckList} onAction={selectAllFiltered} title="Select All Shown" />
                      <Action icon={Icon.XMarkCircle} onAction={clearFiltered} title="Clear Selection" />
                    </ActionPanel>
                  }
                  icon={projectListIcon(project)}
                  keywords={[project.fullPath, project.parentFolder, workspaceName, `@${workspaceName}`]}
                  subtitle={path.dirname(project.fullPath)}
                  title={project.name}
                />
              );
            })}
          </List.Section>
        ))
      )}
    </List>
  );
}

function CreateTagForm() {
  const { createTag } = useTags();
  const { pop } = useNavigation();
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(values: { color?: string; name?: string }) {
    const name = values.name?.trim() ?? "";
    if (!name) {
      setError("Required");
      return;
    }

    const color = (TAG_COLORS.find((entry) => entry.color === values.color)?.color ?? Color.Blue) as Color;
    const tag = await createTag(name, color);
    if (!tag) {
      setError("Could not create tag");
      return;
    }

    await showToast({ style: Toast.Style.Success, title: `Created ${tag.name}` });
    pop();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Plus} onSubmit={handleSubmit} title="Create Tag" />
        </ActionPanel>
      }
      navigationTitle="Create Tag"
    >
      <Form.TextField
        error={error}
        id="name"
        onChange={() => setError(undefined)}
        placeholder="work, personal, client…"
        title="Name"
      />
      <Form.Dropdown defaultValue={Color.Blue} id="color" title="Color">
        {TAG_COLORS.map((entry) => (
          <Form.Dropdown.Item key={entry.color} title={entry.label} value={entry.color} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

function EditTagForm({ tagId }: { tagId: string }) {
  const { tags, updateTag } = useTags();
  const { pop } = useNavigation();
  const [error, setError] = useState<string | undefined>();
  const tag = tags.find((entry) => entry.id === tagId);

  if (!tag) {
    return (
      <List navigationTitle="Edit Tag">
        <List.EmptyView
          actions={
            <ActionPanel>
              <Action icon={Icon.ArrowLeft} onAction={pop} title="Go Back" />
            </ActionPanel>
          }
          description="This tag no longer exists."
          title="Tag not found"
        />
      </List>
    );
  }

  async function handleSubmit(values: { color?: string; name?: string }) {
    const name = values.name?.trim() ?? "";
    if (!name) {
      setError("Required");
      return;
    }

    const color = (TAG_COLORS.find((entry) => entry.color === values.color)?.color ?? tag!.color) as Color;
    await updateTag(tag!.id, { color, name });
    await showToast({ style: Toast.Style.Success, title: "Tag updated" });
    pop();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Check} onSubmit={handleSubmit} title="Save Tag" />
        </ActionPanel>
      }
      navigationTitle={`Edit ${tag.name}`}
    >
      <Form.TextField
        defaultValue={tag.name}
        error={error}
        id="name"
        onChange={() => setError(undefined)}
        title="Name"
      />
      <Form.Dropdown defaultValue={tag.color} id="color" title="Color">
        {TAG_COLORS.map((entry) => (
          <Form.Dropdown.Item key={entry.color} title={entry.label} value={entry.color} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
