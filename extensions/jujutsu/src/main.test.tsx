import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import JJMainOperations from './main';
import { LaunchType } from '@vicinae/api';
import { getWorkingCopyPath, execJJ } from './utils/exec';
import { getJJStatus } from './utils/status';
import { getJJLog } from './utils/log';
import { getJJBookmarks } from './utils/bookmarks';
import '@testing-library/jest-dom';

vi.mock('./utils/exec', () => ({
  getWorkingCopyPath: vi.fn(),
  execJJ: vi.fn(),
}));

vi.mock('./utils/status', () => ({
  getJJStatus: vi.fn(),
}));

vi.mock('./utils/log', () => ({
  getJJLog: vi.fn(),
}));

vi.mock('./utils/bookmarks', () => ({
  getJJBookmarks: vi.fn(),
}));

describe('JJMainOperations', () => {
  const repoPath = '/test/repo';
  const changeId = 'abc123def456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Scenario: Repository dashboard displays with valid path', () => {
    it('renders dashboard with repository name', async () => {
      vi.mocked(getJJStatus).mockReturnValue({
        working_copy: { change_id: changeId, commit_id: 'commit123' },
        working_copy_changes: { modified: ['src/main.ts'], added: [], removed: [], renamed: [] },
        parent_changes: [],
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('JJ Dashboard - repo')).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Working copy has uncommitted changes', () => {
    it('shows uncommitted changes status', async () => {
      vi.mocked(getJJStatus).mockReturnValue({
        working_copy: { change_id: changeId, commit_id: 'commit123' },
        working_copy_changes: { modified: ['src/main.ts'], added: [], removed: [], renamed: [] },
        parent_changes: [],
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Uncommitted changes')).toBeInTheDocument();
      });
    });

    it('displays file count in status', async () => {
      vi.mocked(getJJStatus).mockReturnValue({
        working_copy: { change_id: changeId, commit_id: 'commit123' },
        working_copy_changes: { modified: ['src/main.ts'], added: [], removed: [], renamed: [] },
        parent_changes: [],
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('1 files')).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Working copy is clean', () => {
    it('shows clean working copy status', async () => {
      vi.mocked(getJJStatus).mockReturnValue({
        working_copy: { change_id: changeId, commit_id: 'commit123' },
        working_copy_changes: { modified: [], added: [], removed: [], renamed: [] },
        parent_changes: [],
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean working copy')).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Current change displays description', () => {
    it('displays the change description', async () => {
      vi.mocked(getJJStatus).mockReturnValue({
        working_copy: { change_id: changeId, commit_id: 'commit123' },
        working_copy_changes: { modified: ['src/main.ts'], added: [], removed: [], renamed: [] },
        parent_changes: [],
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test change')).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Repository tools section is visible', () => {
    it('displays change operations section', async () => {
      vi.mocked(getJJStatus).mockReturnValue({
        working_copy: { change_id: changeId, commit_id: 'commit123' },
        working_copy_changes: { modified: ['src/main.ts'], added: [], removed: [], renamed: [] },
        parent_changes: [],
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Change Operations/i)).toBeInTheDocument();
      });
    });

    it('shows repository tools section', async () => {
      vi.mocked(getJJStatus).mockReturnValue({
        working_copy: { change_id: changeId, commit_id: 'commit123' },
        working_copy_changes: { modified: ['src/main.ts'], added: [], removed: [], renamed: [] },
        parent_changes: [],
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Repository Tools/i)).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Error reading repository', () => {
    it('displays error when repository cannot be read', async () => {
      vi.mocked(getJJStatus).mockImplementation(() => {
        throw new Error('Repository not found');
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': '/invalid/repo' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Error reading repository')).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Auto-detect current repository', () => {
    it('detects current repository when no path provided', async () => {
      vi.mocked(getWorkingCopyPath).mockReturnValue('/detected/repo');
      vi.mocked(getJJStatus).mockReturnValue({
        working_copy: { change_id: changeId, commit_id: 'commit123' },
        working_copy_changes: { modified: ['src/main.ts'], added: [], removed: [], renamed: [] },
        parent_changes: [],
      });
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: changeId, commit_id: 'commit123', description: 'Test change', author: 'Test', is_working_copy: true, bookmarks: [], parents: [] },
      ]);
      vi.mocked(getJJBookmarks).mockReturnValue([
        { name: 'main', change_id: changeId, commit_id: 'commit123', remote_refs: ['origin/main'] },
      ]);

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': undefined }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('JJ Dashboard - repo')).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: No repositories found', () => {
    it('shows message when no repositories detected', async () => {
      vi.mocked(getWorkingCopyPath).mockReturnValue(null);
      vi.mocked(execJJ).mockReturnValue('');

      render(
        <JJMainOperations
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': undefined }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No JJ repositories found')).toBeInTheDocument();
      });
    });
  });
});
