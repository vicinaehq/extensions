import React, { useEffect, useState } from 'react';
import {
  ActionPanel,
  Action,
  List,
  Icon,
  closeMainWindow,
  getPreferenceValues,
} from '@vicinae/api';
import type { EditorProgram, Project, TerminalProgram } from './types';
import { listProjects, openInTerminal, openInEditor } from './projects';

const preferences = getPreferenceValues<{
  readonly projectsPath: string;
  readonly projectsDepth: number;
  readonly editorProgram: EditorProgram;
  readonly terminalProgram: TerminalProgram;
}>();

export default function Command() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const projects = await listProjects({
          basePath: preferences.projectsPath,
          searchDepth: preferences.projectsDepth,
        });
        setProjects(projects);
      } catch {
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <List navigationTitle="Projects" isLoading={isLoading}>
      {projects.length === 0 ? (
        !isLoading ? (
          <List.EmptyView
            title="No projects found"
            description="No projects detected in the specified path."
          />
        ) : null
      ) : (
        projects.map((project) => (
          <List.Item
            key={project.path}
            title={project.title}
            subtitle={project.path}
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action
                  title="Open in Code Editor"
                  icon={Icon.Code}
                  shortcut={{ modifiers: ['ctrl'], key: 'e' }}
                  onAction={async () => {
                    await openInEditor(preferences.editorProgram, project.path);
                    closeMainWindow();
                  }}
                />
                <Action
                  title="Open in Terminal"
                  icon={Icon.Terminal}
                  shortcut={{ modifiers: ['ctrl'], key: 't' }}
                  onAction={async () => {
                    await openInTerminal(
                      preferences.terminalProgram,
                      project.path
                    );
                    closeMainWindow();
                  }}
                />
                <Action.ShowInFinder
                  title="Open Folder"
                  icon={Icon.Folder}
                  shortcut={{ modifiers: ['ctrl'], key: 'o' }}
                  path={project.path}
                />
                <Action.CopyToClipboard
                  title="Copy Path to Clipboard"
                  icon={Icon.Clipboard}
                  content={project.path}
                  shortcut={{ modifiers: ['ctrl'], key: 'c' }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
