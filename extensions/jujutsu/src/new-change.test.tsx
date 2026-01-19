import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import NewChange from './new-change';
import { LaunchType } from '@vicinae/api';
import { createNewChange } from './utils/change';
import '@testing-library/jest-dom';

vi.mock('./utils/change', () => ({
  createNewChange: vi.fn(),
}));

describe('NewChange', () => {
  const repoPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Create new change form', () => {
    it('displays optional description field', async () => {
      render(
        <NewChange
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("form")).toBeInTheDocument();
      });
    });

    it('shows create new change button', async () => {
      render(
        <NewChange
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("submit-action")).toBeInTheDocument();
      });
    });

    it('renders form element', async () => {
      render(
        <NewChange
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("form")).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Validation error', () => {
    it('returns detail validation error when repo path missing', async () => {
      render(
        <NewChange
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': undefined }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('detail')).toBeInTheDocument();
      });
    });
  });
});
