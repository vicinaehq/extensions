import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import JJAbandonCommand from './abandon';
import { LaunchType } from '@vicinae/api';
import { getCurrentDescription } from './utils/change';
import { execJJ } from './utils/exec';
import '@testing-library/jest-dom';

vi.mock('./utils/change', () => ({
  getCurrentDescription: vi.fn(),
}));

vi.mock('./utils/exec', () => ({
  execJJ: vi.fn(),
}));

describe('JJAbandonCommand', () => {
  const repoPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Abandon command shows current change info', () => {
    it('displays repository path in confirmation message', async () => {
      vi.mocked(getCurrentDescription).mockReturnValue('Test change description');

      render(
        <JJAbandonCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail")).toBeInTheDocument();
        const detail = screen.getByTestId("detail");
        expect(detail).toHaveTextContent(/test\/repo/);
      });
    });

    it('shows current change description', async () => {
      const description = 'Feature: Add new functionality';
      vi.mocked(getCurrentDescription).mockReturnValue(description);

      render(
        <JJAbandonCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail")).toBeInTheDocument();
        const detail = screen.getByTestId("detail");
        expect(detail).toHaveTextContent(/Feature: Add new functionality/);
      });
    });

    it('shows placeholder when no description', async () => {
      vi.mocked(getCurrentDescription).mockReturnValue('');

      render(
        <JJAbandonCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail")).toHaveTextContent("*No description*");
      });
    });
  });

  describe('Scenario: Abandon command shows warning', () => {
    it('displays undo warning', async () => {
      vi.mocked(getCurrentDescription).mockReturnValue('Test');

      render(
        <JJAbandonCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail")).toHaveTextContent(/cannot be undone/);
      });
    });

    it('lists use cases for abandoning', async () => {
      vi.mocked(getCurrentDescription).mockReturnValue('Test');

      render(
        <JJAbandonCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail")).toHaveTextContent(/start fresh/);
        expect(screen.getByTestId("detail")).toHaveTextContent(/wrong direction/);
      });
    });
  });

  describe('Scenario: Execute abandon operation', () => {
    it('shows abandon action in detail actions', async () => {
      vi.mocked(getCurrentDescription).mockReturnValue('Test');

      render(
        <JJAbandonCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("detail-actions")).toBeInTheDocument();
      });
    });
  });
});
