import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import JJBookmarksCommand from './bookmarks';
import * as bookmarksModule from './utils/bookmarks';
import * as actionsModule from './components/actions';

vi.mock('./utils/bookmarks');
vi.mock('./components/actions');

const mockGetJJBookmarks = vi.mocked(bookmarksModule.getJJBookmarks);
const mockBookmarkItemActions = vi.mocked(actionsModule.BookmarkItemActions);

describe('JJBookmarksCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBookmarkItemActions.mockReturnValue(<div data-testid="bookmark-actions">Actions</div>);
  });

  afterEach(() => {
    cleanup();
  });

  describe('Scenario: Repository path validation', () => {
    it('should show validation error when repo-path is missing', () => {
      render(<JJBookmarksCommand launchType="user-initiated" as="user-initiated" arguments={{ "repo-path": undefined as unknown as string }} />);

      expect(screen.getByText('Repository path required')).toBeInTheDocument();
      expect(screen.getByText('Provide a repository path as argument')).toBeInTheDocument();
    });

    it('should show validation error when repo-path is empty string', () => {
      render(<JJBookmarksCommand launchType="user-initiated" as="user-initiated" arguments={{ "repo-path": "" }} />);

      expect(screen.getByText('Repository path required')).toBeInTheDocument();
    });
  });

  describe('Scenario: Displaying bookmarks list', () => {
    it('should render bookmarks with correct title', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: ['origin/main']
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByTestId('section-title')).toHaveTextContent('Bookmarks - repo');
    });

    it('should display all bookmarks from the repository', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: ['origin/main']
        },
        {
          name: 'feature-branch',
          commit_id: 'def456abc123',
          change_id: 'yyyyyyyyyyyy',
          remote_refs: []
        },
        {
          name: 'develop',
          commit_id: 'ghi789jkl012',
          change_id: 'xxxxxxxxxxxx',
          remote_refs: ['origin/develop', 'github/develop']
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getAllByTestId('list-item')).toHaveLength(3);
      expect(screen.getByText('main')).toBeInTheDocument();
      expect(screen.getByText('feature-branch')).toBeInTheDocument();
      expect(screen.getByText('develop')).toBeInTheDocument();
    });

    it('should show bookmark change_id prefix in subtitle', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: []
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByTestId('item-subtitle')).toHaveTextContent('zzzzzzzz • 0 remote refs');
    });

    it('should show remote refs count in subtitle', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: ['origin/main', 'github/main']
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByTestId('item-subtitle')).toHaveTextContent('zzzzzzzz • 2 remote refs');
    });
  });

  describe('Scenario: Bookmark accessories indicators', () => {
    it('should show Remote indicator with green color for bookmarks with remote refs', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: ['origin/main']
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      const accessories = screen.getByTestId('item-accessories');
      expect(accessories).toHaveTextContent('Remote');
    });

    it('should show Local indicator with orange color for local-only bookmarks', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'local-feature',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: []
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      const accessories = screen.getByTestId('item-accessories');
      expect(accessories).toHaveTextContent('Local');
    });
  });

  describe('Scenario: Bookmark actions', () => {
    it('should render BookmarkItemActions for each bookmark', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: ['origin/main']
        },
        {
          name: 'develop',
          commit_id: 'def456abc123',
          change_id: 'yyyyyyyyyyyy',
          remote_refs: []
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(mockBookmarkItemActions).toHaveBeenCalledTimes(2);
    });
  });

  describe('Scenario: Empty bookmarks list', () => {
    it('should handle empty bookmarks list', () => {
      mockGetJJBookmarks.mockReturnValue([]);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.queryAllByTestId('list-item')).toHaveLength(0);
    });
  });

  describe('Scenario: Repository path handling', () => {
    it('should extract correct directory name from path', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: []
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/home/user/projects/my-awesome-repo" }} />);

      expect(screen.getByTestId('section-title')).toHaveTextContent('Bookmarks - my-awesome-repo');
    });

    it('should handle root path correctly', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: []
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/" }} />);

      expect(screen.getByTestId('section-title')).toHaveTextContent('Bookmarks - /');
    });
  });

  describe('Scenario: Icon rendering', () => {
    it('should render list items for bookmarks', () => {
      const mockBookmarks: bookmarksModule.JJBookmark[] = [
        {
          name: 'main',
          commit_id: 'abc123def456',
          change_id: 'zzzzzzzzzzzz',
          remote_refs: []
        }
      ];
      mockGetJJBookmarks.mockReturnValue(mockBookmarks);

      render(<JJBookmarksCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByTestId('list-item')).toBeInTheDocument();
    });
  });
});
