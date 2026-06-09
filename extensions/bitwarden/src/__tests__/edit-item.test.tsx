import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const { mockBw, mockItem, mockOnSaved } = vi.hoisted(() => {
  const mockBw = {
    getItem: vi.fn(),
    listFolders: vi.fn().mockResolvedValue([]),
    editItem: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn(),
    sync: vi.fn(),
    unlock: vi.fn(),
    login: vi.fn(),
    listItems: vi.fn(),
    lock: vi.fn(),
    getTotp: vi.fn(),
  };

  const mockItem = {
    id: 'item-1',
    type: 1,
    name: 'Test Login',
    notes: 'my notes',
    folderId: null,
    login: {
      username: 'alice',
      password: 'secret',
      totp: null,
      uris: [{ uri: 'https://example.com', match: null }],
    },
  };

  const mockOnSaved = vi.fn();

  return { mockBw, mockItem, mockOnSaved };
});

vi.mock('@vicinae/api', () => ({
  Action: Object.assign(
    ({ title }: { title: string }) =>
      React.createElement(
        'button',
        { 'data-testid': `action-${title.replace(/\s+/g, '-').toLowerCase()}` },
        title,
      ),
    {
      SubmitForm: ({ title }: { title: string }) =>
        React.createElement('button', { type: 'submit', 'data-testid': 'submit-btn' }, title),
      OpenInBrowser: () => null,
      Style: { Destructive: 'destructive' },
    },
  ),
  ActionPanel: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'action-panel' }, children),
  Alert: { ActionStyle: { Destructive: 'destructive' } },
  confirmAlert: vi.fn(),
  Form: Object.assign(
    ({ children }: { children: React.ReactNode }) =>
      React.createElement('form', { 'data-testid': 'form' }, children),
    {
      TextField: ({
        id,
        title,
        defaultValue,
      }: {
        id: string;
        title: string;
        defaultValue?: string;
      }) => React.createElement('input', { 'data-testid': id, placeholder: title, defaultValue }),
      PasswordField: ({
        id,
        title,
        defaultValue,
      }: {
        id: string;
        title: string;
        defaultValue?: string;
      }) =>
        React.createElement('input', {
          type: 'password',
          'data-testid': id,
          placeholder: title,
          defaultValue,
        }),
      TextArea: ({
        id,
        title,
        defaultValue,
      }: {
        id: string;
        title: string;
        defaultValue?: string;
      }) =>
        React.createElement('textarea', { 'data-testid': id, placeholder: title, defaultValue }),
      Dropdown: Object.assign(
        ({ id, title }: { id: string; title: string }) =>
          React.createElement('select', { 'data-testid': id, title }),
        {
          Item: ({ value, title }: { value: string; title: string }) =>
            React.createElement('option', { value, children: title }),
        },
      ),
      Description: ({ text }: { text: string }) =>
        React.createElement('span', { 'data-testid': 'description' }, text),
      Separator: () => React.createElement('hr', { 'data-testid': 'separator' }),
      FilePicker: ({ id }: { id: string }) =>
        React.createElement('input', { 'data-testid': id ?? 'file-picker', type: 'file' }),
    },
  ),
  Icon: {
    Eye: 'icon-eye',
    Pencil: 'icon-pencil',
    Plus: 'icon-plus',
    CheckCircle: 'icon-check',
    Trash: 'icon-trash',
  },
  popToRoot: vi.fn(),
  showToast: vi.fn(),
  Toast: { Style: { Success: 'success', Failure: 'failure' } },
}));

vi.mock('../bw-executor', () => mockBw);

vi.mock('../item-form', () => ({
  toCreatePayload: vi.fn((values: Record<string, string>, type: number) => ({
    type,
    name: values.name ?? '',
    notes: values.notes ?? null,
    folderId: null,
    favorite: false,
  })),
  CARD_BRANDS: ['Visa', 'Mastercard', 'Amex', 'Discover', 'Other'],
  uploadAttachments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../item-list', () => ({
  itemTypeLabel: vi.fn(() => 'Login'),
}));

import EditItem from '../edit-item';

describe('EditItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBw.getItem.mockResolvedValue(mockItem);
    mockBw.listFolders.mockResolvedValue([]);
  });

  it('renders loading state initially', () => {
    mockBw.getItem.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      React.createElement(EditItem, {
        item: mockItem as never,
        session: 'token',
        onSaved: mockOnSaved,
      }),
    );
    expect(screen.getByTestId('description')).toBeTruthy();
  });

  it('renders the form with pre-populated fields after load', async () => {
    render(
      React.createElement(EditItem, {
        item: mockItem as never,
        session: 'token',
        onSaved: mockOnSaved,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('name')).toBeTruthy();
    });

    const nameInput = screen.getByTestId('name') as HTMLInputElement;
    expect(nameInput.defaultValue).toBe('Test Login');

    const usernameInput = screen.getByTestId('username') as HTMLInputElement;
    expect(usernameInput.defaultValue).toBe('alice');
  });

  it('renders the type label', async () => {
    render(
      React.createElement(EditItem, {
        item: mockItem as never,
        session: 'token',
        onSaved: mockOnSaved,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('description')).toBeTruthy();
    });

    expect(screen.getByTestId('description').textContent).toContain('Login');
  });
});
