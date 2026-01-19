import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import JJResolveCommand from './resolve';
import { LaunchType } from '@vicinae/api';
import { execJJ } from './utils/exec';
import { getErrorMessage } from './utils/helpers';
import '@testing-library/jest-dom';

vi.mock('./utils/exec', () => ({
  execJJ: vi.fn(),
}));

vi.mock('./utils/helpers', () => ({
  getErrorMessage: vi.fn((e) => e instanceof Error ? e.message : 'Unknown error'),
  withErrorHandling: vi.fn((fn) => fn),
  SHORTCUTS: {
    VIEW_STATUS: { modifiers: ["ctrl"], key: "s" as const },
    VIEW_LOG: { modifiers: ["ctrl"], key: "l" as const },
  },
}));

describe('JJResolveCommand', () => {
  const repoPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: No conflicts detected', () => {
    it('shows no conflicts message', async () => {
      vi.mocked(execJJ).mockReturnValue('Working copy clean');

      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail")).toHaveTextContent("No Conflicts Found");
      });
    });

    it('explains what conflicts are', async () => {
      vi.mocked(execJJ).mockReturnValue('Working copy clean');

      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail")).toHaveTextContent("What are conflicts?");
      });
    });

    it('describes resolution process', async () => {
      vi.mocked(execJJ).mockReturnValue('Working copy clean');

      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail")).toHaveTextContent("Resolution Process");
      });
    });
  });

  describe('Scenario: Conflicts detected', () => {
    it('displays conflict count', async () => {
      vi.mocked(execJJ).mockReturnValue('Conflict in src/file1.ts\nConflict in src/file2.ts');

      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Conflicts Detected")).toBeInTheDocument();
        const subtitles = screen.getAllByTestId("item-subtitle");
        expect(subtitles[0]).toHaveTextContent(/2 file/);
      });
    });

    it('shows needs resolution status', async () => {
      vi.mocked(execJJ).mockReturnValue('Conflict in src/file.ts');

      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("accessory")).toHaveTextContent("Needs Resolution");
      });
    });

    it('lists individual conflicted files', async () => {
      vi.mocked(execJJ).mockReturnValue('Conflict in src/main.ts\nConflict in src/utils.ts');

      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Resolve src/main.ts")).toBeInTheDocument();
        expect(screen.getByText("Resolve src/utils.ts")).toBeInTheDocument();
      });
    });

    it('shows resolve all conflicts option', async () => {
      vi.mocked(execJJ).mockReturnValue('Conflict in file.ts');

      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        const items = screen.getAllByTestId("list-item");
        expect(items[1]).toHaveTextContent(/Resolve All Conflicts/);
      });
    });
  });

  describe('Scenario: Error checking conflicts', () => {
    it('shows error message when status fails', async () => {
      vi.mocked(execJJ).mockImplementation(() => {
        throw new Error('JJ command failed');
      });

      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Error checking conflicts")).toBeInTheDocument();
        expect(screen.getByText("JJ command failed")).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Validation error', () => {
    it('returns list validation error when repo path missing', async () => {
      render(
        <JJResolveCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': undefined }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("list")).toBeInTheDocument();
      });
    });
  });
});
