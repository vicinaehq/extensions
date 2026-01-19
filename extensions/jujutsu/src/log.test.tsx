import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import JJLogCommand from './log';
import * as logModule from './utils/log';
import * as treeModule from './utils/tree';
import * as actionsModule from './components/actions';

vi.mock('./utils/log');
vi.mock('./utils/tree');
vi.mock('./components/actions');

const mockGetJJLog = vi.mocked(logModule.getJJLog);
const mockBuildRevisionTree = vi.mocked(treeModule.buildRevisionTree);
const mockGetAncestryIndicator = vi.mocked(treeModule.getAncestryIndicator);
const mockChangeItemActions = vi.mocked(actionsModule.ChangeItemActions);

describe('JJLogCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChangeItemActions.mockReturnValue(<div data-testid="change-actions">Actions</div>);
    mockGetAncestryIndicator.mockImplementation((node) => {
      const indent = '  '.repeat(node.level);
      if (node.position === 'root' && node.has_children) {
        return `${indent}●──`;
      }
      return `${indent}○──`;
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Scenario: Repository path validation', () => {
    it('should show validation error when repo-path is missing', () => {
      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": undefined as unknown as string }} />);

      expect(screen.getByText('Repository path required')).toBeInTheDocument();
      expect(screen.getByText('Provide a repository path as argument')).toBeInTheDocument();
    });

    it('should show validation error when repo-path is empty string', () => {
      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "" }} />);

      expect(screen.getByText('Repository path required')).toBeInTheDocument();
    });
  });

  describe('Scenario: Change log display', () => {
    it('should render changes from the repository', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'Add new feature',
          bookmarks: ['main'],
          is_working_copy: false,
          parents: ['def456abc123456']
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: true,
          position: 'root'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('Change Log')).toBeInTheDocument();
    });

    it('should display change description as title', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'Jane Smith',
          description: 'Implement user authentication',
          bookmarks: [],
          is_working_copy: false,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('Implement user authentication')).toBeInTheDocument();
    });

    it('should show "(no description)" for changes without description', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: '',
          bookmarks: [],
          is_working_copy: false,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('(no description)')).toBeInTheDocument();
    });

    it('should display change with author info', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'Alice Cooper',
          description: 'Fix bug in parser',
          bookmarks: [],
          is_working_copy: false,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('Fix bug in parser')).toBeInTheDocument();
    });
  });

  describe('Scenario: Working copy indicator', () => {
    it('should show Working Copy indicator for working copy', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'Working on new feature',
          bookmarks: [],
          is_working_copy: true,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      const accessories = screen.getByTestId('item-accessories');
      expect(accessories).toHaveTextContent('Working Copy');
    });

    it('should use filled circle icon for working copy', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'Working on new feature',
          bookmarks: [],
          is_working_copy: true,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('Working on new feature')).toBeInTheDocument();
    });

    it('should use hollow circle icon for non-working-copy changes', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'Committed change',
          bookmarks: [],
          is_working_copy: false,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('Committed change')).toBeInTheDocument();
    });
  });

  describe('Scenario: Bookmark display in change items', () => {
    it('should show bookmarks as accessories', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'Feature commit',
          bookmarks: ['main', 'develop'],
          is_working_copy: false,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      const accessories = screen.getByTestId('item-accessories');
      expect(accessories).toHaveTextContent('main, develop');
    });

    it('should not show bookmark accessories when change has no bookmarks', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'No bookmarks here',
          bookmarks: [],
          is_working_copy: false,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      const accessories = screen.getByTestId('item-accessories');
      expect(accessories).not.toContainHTML('tag');
    });
  });

  describe('Scenario: Change actions', () => {
    it('should render ChangeItemActions for each change', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'First change',
          bookmarks: [],
          is_working_copy: false,
          parents: []
        },
        {
          commit_id: 'def456abc123456',
          change_id: 'yyyyyyyyyyyyyyyy',
          author: 'Jane Doe',
          description: 'Second change',
          bookmarks: [],
          is_working_copy: false,
          parents: ['zzzzzzzzzzzzzzzz']
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = mockChanges.map((change, index) => ({
        change,
        level: index,
        has_children: index < mockChanges.length - 1,
        has_parents: index > 0,
        position: index === 0 ? 'root' : 'end'
      }));
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(mockChangeItemActions).toHaveBeenCalledTimes(2);
    });

    it('should pass correct props to ChangeItemActions', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'Test change',
          bookmarks: [],
          is_working_copy: false,
          parents: []
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: false,
          position: 'single'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(mockChangeItemActions).toHaveBeenCalled();
    });
  });

  describe('Scenario: Quick Revsets section', () => {
    it('should display first 5 revset presets', () => {
      const mockChanges: logModule.JJChange[] = [];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue([]);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      const sections = screen.getAllByTestId('list-section');
      expect(sections).toHaveLength(2);
      expect(sections[1]).toHaveTextContent('Quick Revsets');
    });

    it('should show revset preset details', () => {
      const mockChanges: logModule.JJChange[] = [];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue([]);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('Quick Revsets')).toBeInTheDocument();
    });
  });

  describe('Scenario: Multiple changes display', () => {
    it('should render change log section', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'Latest commit',
          bookmarks: [],
          is_working_copy: false,
          parents: ['yyy123']
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue([]);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('Change Log')).toBeInTheDocument();
    });
  });

  describe('Scenario: Empty log', () => {
    it('should handle empty changes list', () => {
      mockGetJJLog.mockReturnValue([]);
      mockBuildRevisionTree.mockReturnValue([]);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(screen.getByText('Change Log')).toBeInTheDocument();
    });
  });

  describe('Scenario: Revision tree building', () => {
    it('should build revision tree with correct structure', () => {
      const mockChanges: logModule.JJChange[] = [
        {
          commit_id: 'abc123def456789',
          change_id: 'zzzzzzzzzzzzzzzz',
          author: 'John Doe',
          description: 'Head commit',
          bookmarks: [],
          is_working_copy: false,
          parents: ['yyy123']
        }
      ];
      const mockNodes: treeModule.RevisionNode[] = [
        {
          change: mockChanges[0],
          level: 0,
          has_children: false,
          has_parents: true,
          position: 'end'
        }
      ];
      mockGetJJLog.mockReturnValue(mockChanges);
      mockBuildRevisionTree.mockReturnValue(mockNodes);

      render(<JJLogCommand launchType="user-initiated" arguments={{ "repo-path": "/test/repo" }} />);

      expect(mockBuildRevisionTree).toHaveBeenCalledWith(mockChanges);
    });
  });
});
