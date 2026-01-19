import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import JJEditCommand from './edit';
import { LaunchType } from '@vicinae/api';
import { getJJLog } from './utils/log';
import { execJJ } from './utils/exec';
import '@testing-library/jest-dom';

vi.mock('./utils/log', () => ({
  getJJLog: vi.fn(),
}));

vi.mock('./utils/exec', () => ({
  execJJ: vi.fn(),
}));

describe('JJEditCommand', () => {
  const repoPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Display time travel interface', () => {
    it('shows time travel section title', async () => {
      vi.mocked(getJJLog).mockReturnValue([]);

      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        const sections = screen.getAllByTestId("list-section");
        expect(sections[0]).toHaveTextContent(/Time Travel/);
      });
    });

    it('displays quick navigation item', async () => {
      vi.mocked(getJJLog).mockReturnValue([]);

      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByTestId("list-item")[0]).toHaveTextContent(/Quick Navigation/);
      });
    });
  });

  describe('Scenario: Navigation actions', () => {
    it('shows go to parent action', async () => {
      vi.mocked(getJJLog).mockReturnValue([]);

      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Go to Parent" })).toBeInTheDocument();
        expect(screen.getByText("Edit the parent of current change")).toBeInTheDocument();
      });
    });

    it('shows go to child action', async () => {
      vi.mocked(getJJLog).mockReturnValue([]);

      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Go to Child" })).toBeInTheDocument();
        expect(screen.getByText("Edit the next child change")).toBeInTheDocument();
      });
    });

    it('shows search by description action', async () => {
      vi.mocked(getJJLog).mockReturnValue([]);

      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Search by Description")).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Recent changes list', () => {
    it('shows recent changes section', async () => {
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: 'abc123', commit_id: 'commit1', description: 'Recent change', author: 'User', is_working_copy: true, bookmarks: [], parents: [] },
      ]);

      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Recent Changes")).toBeInTheDocument();
      });
    });

    it('displays change with description and author', async () => {
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: 'abc123def456', commit_id: 'commit1', description: 'Fix bug by John', author: 'John', is_working_copy: false, bookmarks: [], parents: [] },
      ]);

      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Fix bug by John/)).toBeInTheDocument();
        expect(screen.getByText(/John/)).toBeInTheDocument();
      });
    });

    it('shows current change marker', async () => {
      vi.mocked(getJJLog).mockReturnValue([
        { change_id: 'abc123', commit_id: 'commit1', description: 'WIP', author: 'User', is_working_copy: true, bookmarks: [], parents: [] },
      ]);

      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        const listItems = screen.getAllByTestId("list-item");
        const currentItem = listItems.find(item => item.textContent?.includes("Current"));
        expect(currentItem).toBeTruthy();
      });
    });
  });

  describe('Scenario: Validation error', () => {
    it('returns list validation error when repo path missing', async () => {
      render(
        <JJEditCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': undefined }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('list')).toBeInTheDocument();
      });
    });
  });
});
