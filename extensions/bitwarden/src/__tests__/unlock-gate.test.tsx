import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { makeFormMock } from './__utils__/vicinae-mocks';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
const { MockAction } = vi.hoisted(() => {
  const Action = Object.assign(
    function Action({ title, onAction }: { title: string; onAction?: () => void }) {
      return React.createElement('button', { 'data-testid': 'action', onClick: onAction }, title);
    },
    {
      SubmitForm({ title }: { title: string }) {
        return React.createElement('button', { type: 'submit' }, title);
      },
    },
  );
  return { MockAction: Action };
});

vi.mock('@vicinae/api', () => ({
  Action: MockAction,
  ActionPanel: 'ActionPanel',
  Form: makeFormMock({
    Description(props: { title?: string; text?: string }) {
      return React.createElement(
        'div',
        { 'data-testid': 'form-description' },
        React.createElement('strong', null, props.title),
        React.createElement('span', null, props.text),
      );
    },
  }),
  showToast: vi.fn(),
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
}));

vi.mock('../bw-not-installed', () => ({
  BwNotInstalled: () =>
    React.createElement('div', { 'data-testid': 'bw-not-installed' }, 'Install BW'),
  SecretToolNotInstalled: () =>
    React.createElement('div', { 'data-testid': 'secret-tool-not-installed' }, 'Install libsecret'),
}));

vi.mock('../bw-executor', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

vi.mock('../session-store', () => ({
  checkSecretToolInstalled: vi.fn().mockResolvedValue(true),
}));

import { createUnlockCallbacks, renderUnlockGate } from '../unlock-gate';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// createUnlockCallbacks
// ---------------------------------------------------------------------------
describe('createUnlockCallbacks', () => {
  it('onLoginError sets state to login-failed', () => {
    const setState = vi.fn();
    const onUnlockReady = vi.fn();
    const { onLoginError } = createUnlockCallbacks(setState, onUnlockReady);

    onLoginError('Invalid API key');

    expect(setState).toHaveBeenCalledWith({ kind: 'login-failed', error: 'Invalid API key' });
  });

  it('onLoginReady sets state to needs-unlock', () => {
    const setState = vi.fn();
    const onUnlockReady = vi.fn();
    const { onLoginReady } = createUnlockCallbacks(setState, onUnlockReady);

    onLoginReady();

    expect(setState).toHaveBeenCalledWith({ kind: 'needs-unlock' });
  });

  it('onUnlockStart sets state to unlocking', () => {
    const setState = vi.fn();
    const onUnlockReady = vi.fn();
    const { onUnlockStart } = createUnlockCallbacks(setState, onUnlockReady);

    onUnlockStart();

    expect(setState).toHaveBeenCalledWith({ kind: 'unlocking' });
  });

  it('onUnlockReady calls the ready callback directly', () => {
    const setState = vi.fn();
    const onUnlockReady = vi.fn();
    const { onUnlockReady: cb } = createUnlockCallbacks(setState, onUnlockReady);

    cb();

    expect(onUnlockReady).toHaveBeenCalledOnce();
  });

  it('onUnlockError sets state to needs-unlock with error', () => {
    const setState = vi.fn();
    const onUnlockReady = vi.fn();
    const { onUnlockError } = createUnlockCallbacks(setState, onUnlockReady);

    onUnlockError('Invalid master password');

    expect(setState).toHaveBeenCalledWith({
      kind: 'needs-unlock',
      error: 'Invalid master password',
    });
  });
});

// ---------------------------------------------------------------------------
// renderUnlockGate
// ---------------------------------------------------------------------------
describe('renderUnlockGate', () => {
  it('renders BwNotInstalled for bw-not-installed kind', () => {
    const el = renderUnlockGate('bw-not-installed', undefined, vi.fn());
    expect(el).toBeTruthy();
  });

  it('renders SecretToolNotInstalled for secret-tool-not-installed kind', () => {
    const el = renderUnlockGate('secret-tool-not-installed', undefined, vi.fn());
    expect(el).toBeTruthy();
  });

  it('renders unlock form for needs-unlock kind', () => {
    render(renderUnlockGate('needs-unlock', undefined, vi.fn()));
    expect(screen.getByTestId('password')).toBeTruthy();
  });

  it('renders unlock form with loading state for unlocking kind', () => {
    render(renderUnlockGate('unlocking', undefined, vi.fn()));
    expect(screen.getByTestId('password')).toBeTruthy();
  });

  it('renders login-failed form with error text', () => {
    render(renderUnlockGate('login-failed', 'Invalid API key', vi.fn()));
    expect(screen.getByText('Login failed')).toBeTruthy();
    expect(screen.getByText('Invalid API key')).toBeTruthy();
  });

  it('renders login-failed with default message when error is undefined', () => {
    render(renderUnlockGate('login-failed', undefined, vi.fn()));
    expect(screen.getByText('Check your API key in extension preferences')).toBeTruthy();
  });

  it('renders Retry Login button when onRetryLogin is provided', () => {
    const onRetry = vi.fn();
    render(renderUnlockGate('login-failed', 'Auth error', vi.fn(), onRetry));
    expect(screen.getByTestId('action')).toBeTruthy();
    expect(screen.getByText('Retry Login')).toBeTruthy();
  });

  it('does not show Retry Login button when onRetryLogin is not provided', () => {
    render(renderUnlockGate('login-failed', 'Auth error', vi.fn()));
    expect(screen.queryByTestId('action')).toBeNull();
  });

  it('returns null for unknown kinds', () => {
    const result = renderUnlockGate('vault', undefined, vi.fn());
    expect(result).toBeNull();
  });
});
