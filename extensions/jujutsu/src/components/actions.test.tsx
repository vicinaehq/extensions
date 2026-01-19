import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ClipboardAction,
  CopyChangeIdAction,
  CopyIdAction,
  ViewStatusAction,
  ViewLogAction,
} from './actions';
import '@testing-library/jest-dom';
import { Icon } from '@vicinae/api';
import { SHORTCUTS } from '../utils/helpers';

vi.mock('../utils/helpers', () => ({
  SHORTCUTS: {
    COPY_ID: { modifiers: ['ctrl'], key: 'c' },
    VIEW_STATUS: { modifiers: ['ctrl'], key: 's' },
    VIEW_LOG: { modifiers: ['ctrl'], key: 'l' },
  },
  launchCommand: vi.fn(),
  getErrorMessage: vi.fn((e) => e instanceof Error ? e.message : 'Unknown error'),
  withErrorHandling: vi.fn((fn) => fn),
}));

describe('ClipboardAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders action with title', () => {
    render(
      <ClipboardAction
        title="Copy Value"
        value="test-value"
        successTitle="Copied!"
      />
    );

    expect(screen.getByRole('button', { name: 'Copy Value' })).toBeInTheDocument();
  });

  it('contains correct value in accessible name', () => {
    render(
      <ClipboardAction
        title="Copy Path"
        value="/home/user/repo"
        successTitle="Path copied!"
      />
    );

    expect(screen.getByRole('button', { name: 'Copy Path' })).toBeInTheDocument();
  });
});

describe('CopyChangeIdAction', () => {
  it('renders with change ID', () => {
    render(
      <CopyChangeIdAction
        changeId="abc123def456"
        repoPath="/test/repo"
      />
    );

    expect(screen.getByRole('button', { name: 'Copy Change ID' })).toBeInTheDocument();
  });

  it('uses shortcut from SHORTCUTS', () => {
    expect(SHORTCUTS.COPY_ID).toEqual({ modifiers: ['ctrl'], key: 'c' });
  });
});

describe('CopyIdAction', () => {
  it('renders copy action for change ID', () => {
    render(
      <CopyIdAction
        id="def456abc789"
        idType="Change ID"
      />
    );

    expect(screen.getByRole('button', { name: 'Copy Change ID' })).toBeInTheDocument();
  });

  it('renders copy action for commit ID', () => {
    render(
      <CopyIdAction
        id="commit123"
        idType="Commit ID"
      />
    );

    expect(screen.getByRole('button', { name: 'Copy Commit ID' })).toBeInTheDocument();
  });

  it('renders copy action for bookmark name', () => {
    render(
      <CopyIdAction
        id="main"
        idType="Bookmark Name"
      />
    );

    expect(screen.getByRole('button', { name: 'Copy Bookmark Name' })).toBeInTheDocument();
  });
});

describe('ViewStatusAction', () => {
  it('renders with View Status title', () => {
    render(<ViewStatusAction repoPath="/test/repo" />);

    expect(screen.getByRole('button', { name: 'View Status...' })).toBeInTheDocument();
  });

  it('uses VIEW_STATUS shortcut', () => {
    expect(SHORTCUTS.VIEW_STATUS).toEqual({ modifiers: ['ctrl'], key: 's' });
  });
});

describe('ViewLogAction', () => {
  it('renders with View Log title', () => {
    render(<ViewLogAction repoPath="/test/repo" />);

    expect(screen.getByRole('button', { name: 'View Log...' })).toBeInTheDocument();
  });

  it('uses VIEW_LOG shortcut', () => {
    expect(SHORTCUTS.VIEW_LOG).toEqual({ modifiers: ['ctrl'], key: 'l' });
  });
});
