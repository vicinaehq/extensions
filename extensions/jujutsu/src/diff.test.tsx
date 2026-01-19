import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import JJDiffCommand from './diff';
import { LaunchType } from '@vicinae/api';
import { getJJDiff } from './utils/diff';
import '@testing-library/jest-dom';

vi.mock('./utils/diff', () => ({
  getJJDiff: vi.fn(),
}));

describe('JJDiffCommand', () => {
  const repoPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Display diff output', () => {
    it('renders diff with repository name in header', async () => {
      const mockDiff = `diff --git a/src/main.ts b/src/main.ts
+const newFeature = true;`;
      vi.mocked(getJJDiff).mockReturnValue(mockDiff);

      render(
        <JJDiffCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('detail')).toHaveTextContent(/JJ Diff/i);
        expect(screen.getByTestId('detail')).toHaveTextContent(/repo/i);
      });
    });

    it('displays diff content in code block', async () => {
      const mockDiff = `diff --git a/src/main.ts b/src/main.ts
+const x = 1;`;
      vi.mocked(getJJDiff).mockReturnValue(mockDiff);

      render(
        <JJDiffCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('detail')).toHaveTextContent(/```diff/i);
        expect(screen.getByTestId('detail')).toHaveTextContent(/src\/main\.ts/i);
      });
    });
  });

  describe('Scenario: Working copy is clean', () => {
    it('shows no changes message when diff is empty', async () => {
      vi.mocked(getJJDiff).mockReturnValue('');

      render(
        <JJDiffCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('detail')).toHaveTextContent(/No changes/i);
        expect(screen.getByTestId('detail')).toHaveTextContent(/clean/i);
      });
    });

    it('shows no changes message when diff is whitespace only', async () => {
      vi.mocked(getJJDiff).mockReturnValue('   \n\n  ');

      render(
        <JJDiffCommand
          launchType={LaunchType.UserInitiated}
          arguments={{ 'repo-path': repoPath }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('detail')).toHaveTextContent(/No changes/i);
      });
    });
  });

  describe('Scenario: Validation error', () => {
    it('returns detail validation error when repo path missing', async () => {
      render(
        <JJDiffCommand
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
