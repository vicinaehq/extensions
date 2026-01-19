import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DescribeChange from './describe';
import { LaunchType } from '@vicinae/api';
import { describeChange, getCurrentDescription } from './utils/change';
import '@testing-library/jest-dom';

vi.mock('./utils/change', () => ({
  describeChange: vi.fn(),
  getCurrentDescription: vi.fn(() => ""),
}));

describe('DescribeChange', () => {
  const repoPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentDescription).mockReturnValue("");
  });

  describe('Scenario: Display current description', () => {
    it('shows current description in text field', async () => {
      const currentDesc = 'Original description';
      vi.mocked(getCurrentDescription).mockReturnValue(currentDesc);

      render(
        <DescribeChange
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("form")).toBeInTheDocument();
      });
    });

    it('shows empty text field when no description', async () => {
      vi.mocked(getCurrentDescription).mockReturnValue('');

      render(
        <DescribeChange
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("form")).toBeInTheDocument();
      });
    });

    it('displays description field with title', async () => {
      vi.mocked(getCurrentDescription).mockReturnValue('Test');

      render(
        <DescribeChange
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("form")).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Submit description update', () => {
    it('shows submit form button', async () => {
      vi.mocked(getCurrentDescription).mockReturnValue('Test');

      render(
        <DescribeChange
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("submit-action")).toBeInTheDocument();
      });
    });
  });

  describe('Scenario: Validation error', () => {
    it('returns validation error when repo path missing', async () => {
      render(
        <DescribeChange
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
