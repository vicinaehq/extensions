import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import JJSquashCommand from './squash';
import { LaunchType } from '@vicinae/api';
import { execJJ } from './utils/exec';
import '@testing-library/jest-dom';

vi.mock('./utils/exec', () => ({
  execJJ: vi.fn(),
}));

describe('JJSquashCommand', () => {
  const repoPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Squash options display', () => {
    it('shows squash all changes option', async () => {
      render(
        <JJSquashCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByTestId("list-item")[0]).toHaveTextContent(/Squash All Changes/);
      });
    });

    it('shows interactive squash option', async () => {
      render(
        <JJSquashCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByTestId("list-item")[1]).toHaveTextContent(/Interactive Squash/);
      });
    });

    it('displays squash options section title', async () => {
      render(
        <JJSquashCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Squash Options")).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Squash action buttons', () => {
    it('shows action button for squash all', async () => {
      render(
        <JJSquashCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Squash All Changes" })).toBeInTheDocument();
      });
    });

    it('shows action button for interactive squash', async () => {
      render(
        <JJSquashCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Interactive Squash" })).toBeInTheDocument();
      });
    });
  });
});
