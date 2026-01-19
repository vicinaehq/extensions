import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SHORTCUTS, getErrorMessage, withErrorHandling } from './utils/helpers';
import { showToast } from '@vicinae/api';

vi.mock('@vicinae/api', () => ({
  showToast: vi.fn(),
  Toast: {
    Style: {
      Success: 'success',
      Failure: 'failure',
    },
  },
}));

describe('SHORTCUTS', () => {
  it('defines VIEW_STATUS shortcut', () => {
    expect(SHORTCUTS.VIEW_STATUS).toEqual({
      modifiers: ['ctrl'],
      key: 's',
    });
  });

  it('defines VIEW_LOG shortcut', () => {
    expect(SHORTCUTS.VIEW_LOG).toEqual({
      modifiers: ['ctrl'],
      key: 'l',
    });
  });

  it('defines VIEW_DIFF shortcut', () => {
    expect(SHORTCUTS.VIEW_DIFF).toEqual({
      modifiers: ['ctrl'],
      key: 'd',
    });
  });

  it('defines COPY_ID shortcut', () => {
    expect(SHORTCUTS.COPY_ID).toEqual({
      modifiers: ['ctrl'],
      key: 'c',
    });
  });

  it('defines CONFIRM shortcut', () => {
    expect(SHORTCUTS.CONFIRM).toEqual({
      modifiers: ['ctrl'],
      key: 'enter',
    });
  });

  it('defines all navigation shortcuts', () => {
    expect(SHORTCUTS.PULL_PUSH).toBeDefined();
    expect(SHORTCUTS.PULL_ONLY).toBeDefined();
    expect(SHORTCUTS.PUSH_ONLY).toBeDefined();
    expect(SHORTCUTS.TIME_TRAVEL).toBeDefined();
  });

  it('defines bookmark management shortcuts', () => {
    expect(SHORTCUTS.PUSH_BOOKMARK).toBeDefined();
    expect(SHORTCUTS.TRACK_REMOTE).toBeDefined();
    expect(SHORTCUTS.FORGET_BOOKMARK).toBeDefined();
    expect(SHORTCUTS.DELETE_BOOKMARK).toBeDefined();
    expect(SHORTCUTS.CREATE_BOOKMARK).toBeDefined();
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    const error = new Error('Test error message');
    const message = getErrorMessage(error);
    expect(message).toBe('Test error message');
  });

  it('handles unknown error types', () => {
    const message = getErrorMessage('string error');
    expect(message).toBe('Unknown error');
  });

  it('handles null error', () => {
    const message = getErrorMessage(null);
    expect(message).toBe('Unknown error');
  });

  it('handles undefined error', () => {
    const message = getErrorMessage(undefined);
    expect(message).toBe('Unknown error');
  });

  it('handles object error', () => {
    const message = getErrorMessage({ code: 'ENOENT' });
    expect(message).toBe('Unknown error');
  });
});

describe('withErrorHandling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls operation and shows success toast on success', async () => {
    const operation = vi.fn().mockResolvedValue(undefined);
    const wrapped = withErrorHandling(operation, 'Operation completed!');

    await wrapped();

    expect(operation).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith({
      title: 'Operation completed!',
      style: 'success',
    });
  });

  it('shows failure toast when operation throws', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    const wrapped = withErrorHandling(operation, 'Success title');

    await wrapped();

    expect(operation).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith({
      title: 'Operation failed',
      message: 'Operation failed',
      style: 'failure',
    });
  });

  it('handles unknown error in failure case', async () => {
    const operation = vi.fn().mockRejectedValue('unknown error');
    const wrapped = withErrorHandling(operation, 'Success title');

    await wrapped();

    expect(showToast).toHaveBeenCalledWith({
      title: 'Operation failed',
      message: 'Unknown error',
      style: 'failure',
    });
  });

  it('passes arguments to operation', async () => {
    const operation = vi.fn().mockResolvedValue(undefined);
    const wrapped = withErrorHandling(operation, 'Done');

    await wrapped('arg1', 2, { key: 'value' });

    expect(operation).toHaveBeenCalledWith('arg1', 2, { key: 'value' });
  });

  it('returns a function', () => {
    const operation = async () => {};
    const wrapped = withErrorHandling(operation, 'Done');
    expect(typeof wrapped).toBe('function');
  });
});
