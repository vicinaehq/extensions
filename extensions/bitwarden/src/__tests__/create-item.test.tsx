import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// All mock factory values must be hoisted for vi.mock
// ---------------------------------------------------------------------------
const {
  mockBw,
  mockUseSession,
  mockPopToRoot,
  mockShowToast,
  MockForm,
  MockActionSubmitForm,
  MockActionPanel,
  getFormSubmitHandler,
} = vi.hoisted(() => {
  const mockBw = {
    checkInstalled: vi.fn().mockResolvedValue(true),
    status: vi.fn().mockResolvedValue({ status: 'unlocked' }),
    listFolders: vi.fn().mockResolvedValue([]),
    createItem: vi.fn().mockResolvedValue({ id: 'new-id', name: 'Test' }),
    login: vi.fn(),
    unlock: vi.fn(),
    sync: vi.fn(),
    lock: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    getTotp: vi.fn(),
    deleteItem: vi.fn(),
    getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  };

  const mockUseSession = {
    session: 'test-session' as string | null,
    unlock: vi.fn(),
    clearSession: vi.fn(),
    loginIfNeeded: vi.fn(),
    isLoggingIn: false,
    loginError: null as string | null,
  };

  const mockPopToRoot = vi.fn();
  const mockShowToast = vi.fn();

  let _handler: ((values: Record<string, unknown>) => void) | null = null;

  // fallow-ignore-next-line code-duplication
  const el = (type: string, testId?: string) => {
    return (props: { children?: React.ReactNode; [key: string]: unknown }) => {
      const { children, ...rest } = props;
      return React.createElement(type, { 'data-testid': testId ?? props.id, ...rest }, children);
    };
  };

  // fallow-ignore-next-line code-duplication
  const DropdownItem = el('option');
  // fallow-ignore-next-line code-duplication
  const Dropdown = Object.assign(el('select'), { Item: DropdownItem });

  const FormInner = el('div');
  const MockForm = Object.assign(
    function FormWrapper(props: {
      children: React.ReactNode;
      actions?: React.ReactNode;
      isLoading?: boolean;
    }) {
      return React.createElement(
        'form',
        { 'data-testid': 'form' },
        React.createElement(FormInner, null, props.children),
        props.actions,
      );
    },
    {
      Dropdown,
      TextField: el('input'),
      PasswordField: el('input'),
      TextArea: el('textarea'),
      Description: el('span'),
      Separator: () => React.createElement('hr', { 'data-testid': 'separator' }),
      FilePicker: el('input'),
    },
  );

  const MockActionSubmitForm = vi.fn(
    ({
      title,
      onSubmit,
    }: {
      title: string;
      onSubmit: (values: Record<string, unknown>) => void;
    }) => {
      _handler = onSubmit;
      return React.createElement('button', { type: 'submit', 'data-testid': 'submit-btn' }, title);
    },
  );

  const MockActionPanel = vi.fn(({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'action-panel' }, children),
  );

  return {
    mockBw,
    mockUseSession,
    mockPopToRoot,
    mockShowToast,
    MockForm,
    MockActionSubmitForm,
    MockActionPanel,
    getFormSubmitHandler: () => _handler,
  };
});

vi.mock('../bw-executor', () => mockBw);

vi.mock('../secret-store', () => ({
  checkSecretToolInstalled: vi.fn().mockResolvedValue(true),
}));

vi.mock('../use-session', () => ({
  useSession: () => mockUseSession,
}));

vi.mock('../item-utils', () => ({
  toCreatePayload: vi.fn((values: Record<string, string>, type: number) => ({
    type,
    name: values.name ?? '',
    notes: null,
    folderId: null,
    favorite: false,
  })),
  CARD_BRANDS: ['Visa', 'Mastercard', 'Amex', 'Discover', 'Other'],
  readFormValues: vi.fn((values: Record<string, string>) => {
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(values)) {
      result[key] = String(val ?? '');
    }
    return result;
  }),
  uploadAttachments: vi.fn().mockResolvedValue(undefined),
  showFailureToast: async (_err: unknown, title: string) =>
    mockShowToast({ style: 'failure', title }),
}));

vi.mock('../bw-not-installed', () => ({
  BwNotInstalled: () => React.createElement('div', { 'data-testid': 'bw-not-installed' }),
  SecretToolNotInstalled: () =>
    React.createElement('div', { 'data-testid': 'secret-tool-not-installed' }),
}));

vi.mock('@vicinae/api', () => ({
  Action: Object.assign(
    ({ title, onAction }: { title: string; onAction?: () => void }) =>
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': `action-${title?.replace(/\s+/g, '-').toLowerCase()}`,
          onClick: onAction,
        },
        title,
      ),
    {
      SubmitForm: MockActionSubmitForm,
      OpenInBrowser: vi.fn(() => null),
      Style: { Destructive: 'destructive' },
    },
  ),
  ActionPanel: MockActionPanel,
  Clipboard: { copy: vi.fn().mockResolvedValue(undefined) },
  Form: MockForm,
  Icon: { Key: 'icon-key' },
  popToRoot: (...args: unknown[]) => mockPopToRoot(...args),
  showToast: (...args: unknown[]) => mockShowToast(...args),
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
  LocalStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
  Image: {},
}));

// ---------------------------------------------------------------------------
import CreateItem from '../create-item';

beforeEach(() => {
  vi.clearAllMocks();
  mockBw.checkInstalled.mockResolvedValue(true);
  mockBw.status.mockResolvedValue({ status: 'unlocked' });
  mockBw.listFolders.mockResolvedValue([]);
  mockBw.createItem.mockResolvedValue({ id: 'new-id', name: 'Test' });
  mockUseSession.session = 'test-session';
  mockUseSession.isLoggingIn = false;
  mockUseSession.loginError = null;
});

// ---------------------------------------------------------------------------
describe('CreateItem', () => {
  it('renders the form with fields when session is available', async () => {
    render(React.createElement(CreateItem));

    await waitFor(() => {
      expect(screen.getByTestId('form')).toBeTruthy();
      expect(screen.getByTestId('name')).toBeTruthy();
      expect(screen.getByTestId('itemType')).toBeTruthy();
    });
  });

  it('shows unlock form when session is null', async () => {
    mockUseSession.session = null;
    mockBw.status.mockResolvedValue({ status: 'locked' });

    render(React.createElement(CreateItem));

    await waitFor(() => {
      expect(screen.getByTestId('password')).toBeTruthy();
    });
  });

  it('shows bw-not-installed when CLI not found', async () => {
    mockBw.checkInstalled.mockResolvedValue(false);

    render(React.createElement(CreateItem));

    await waitFor(() => {
      expect(screen.getByTestId('bw-not-installed')).toBeTruthy();
    });
  });

  it('calls createItem and popToRoot on successful submit', async () => {
    render(React.createElement(CreateItem));

    await waitFor(() => {
      expect(screen.getByTestId('submit-btn')).toBeTruthy();
    });

    getFormSubmitHandler()?.({ name: 'Test Item' });

    await waitFor(() => {
      expect(mockBw.createItem).toHaveBeenCalledOnce();
      expect(mockPopToRoot).toHaveBeenCalledOnce();
    });
  });

  it('shows failure toast when createItem fails', async () => {
    mockBw.createItem.mockRejectedValueOnce(new Error('Validation error'));

    render(React.createElement(CreateItem));

    await waitFor(() => {
      expect(screen.getByTestId('submit-btn')).toBeTruthy();
    });

    getFormSubmitHandler()?.({ name: 'Bad Item' });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'failure', title: 'Failed to create item' }),
      );
    });
  });

  it('shows login-specific fields: username, password, url, totp', async () => {
    render(React.createElement(CreateItem));

    await waitFor(() => {
      expect(screen.getByTestId('username')).toBeTruthy();
      expect(screen.getByTestId('password')).toBeTruthy();
      expect(screen.getByTestId('url')).toBeTruthy();
      expect(screen.getByTestId('totp')).toBeTruthy();
    });
  });
});
