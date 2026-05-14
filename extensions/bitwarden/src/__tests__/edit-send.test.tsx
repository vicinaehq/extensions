import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SendType, type BwSend } from '../send-types';

const mockBw = vi.hoisted(() => ({
  getSend: vi.fn(),
  editSend: vi.fn(),
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

const mockPopToRoot = vi.hoisted(() => vi.fn());
const mockShowToast = vi.hoisted(() => vi.fn());
const mockDeleteSendWithConfirm = vi.hoisted(() => vi.fn());

vi.mock('../bw-executor', () => ({
  ...mockBw,
  getErrorMessage: mockBw.getErrorMessage,
}));

vi.mock('../item-utils', () => ({
  showFailureToast: async (_err: unknown, title: string) =>
    mockShowToast({ style: 'failure', title }),
  readFormValues: (values: Record<string, unknown>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) out[k] = String(v ?? '');
    return out;
  },
}));

vi.mock('../send-utils', () => ({
  deleteSendWithConfirm: (...args: unknown[]) => mockDeleteSendWithConfirm(...args),
  sendTypeLabel: (send: BwSend) => (send.type === SendType.Text ? 'Text' : 'File'),
  toSendPayload: (values: Record<string, string>, type: number) => ({
    name: values.name,
    type,
    text: { text: values.textContent ?? '', hidden: false },
    file: null,
    password: values.password || null,
    notes: values.notes || null,
    maxAccessCount: null,
    deletionDate: null,
    expirationDate: null,
    disabled: false,
    hideEmail: false,
  }),
  EDIT_HOURS_OPTIONS: [{ value: '-1', title: 'Keep existing' }],
}));

vi.mock('@vicinae/api', () => {
  // Build a controllable Form/Action/Field set that captures default values
  // and lets the test invoke onSubmit with arbitrary values.
  const submitHandlers: Array<(values: Record<string, unknown>) => void> = [];
  const fieldValues: Record<string, unknown> = {};
  const setFieldErrors: Record<string, (e: string | undefined) => void> = {};

  const Form: any = ({ children, actions }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'form' },
      actions,
      ...React.Children.toArray(children),
    );
  Form.TextField = ({ id, defaultValue, error }: any) => {
    fieldValues[id] = defaultValue ?? '';
    return React.createElement('input', {
      'data-testid': `field-${id}`,
      'data-default': defaultValue ?? '',
      'data-error': error ?? '',
    });
  };
  Form.TextArea = Form.TextField;
  Form.PasswordField = Form.TextField;
  Form.Checkbox = ({ id, defaultValue }: any) => {
    fieldValues[id] = defaultValue ?? false;
    return React.createElement('input', {
      'data-testid': `field-${id}`,
      type: 'checkbox',
      'data-default': String(defaultValue ?? ''),
    });
  };
  Form.Dropdown = ({ id, defaultValue, children }: any) => {
    fieldValues[id] = defaultValue ?? '';
    return React.createElement(
      'div',
      { 'data-testid': `field-${id}` },
      ...React.Children.toArray(children),
    );
  };
  Form.Dropdown.Item = () => null;
  Form.Description = ({ text }: any) =>
    React.createElement('p', { 'data-testid': 'description' }, text);
  Form.Separator = () => React.createElement('hr');

  const Action = Object.assign(createActionMock(), {
    SubmitForm: ({ title, onSubmit }: any) => {
      submitHandlers.push(onSubmit);
      return React.createElement(
        'button',
        {
          'data-testid': `submit-${title.replace(/\s+/g, '-').toLowerCase()}`,
          onClick: () => onSubmit?.(fieldValues),
        },
        title,
      );
    },
  });

  const ActionPanel = ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'action-panel' }, children);

  return {
    Action,
    ActionPanel,
    Form,
    Icon: { CheckCircle: 'check', Trash: 'trash', Eye: 'eye', EyeDisabled: 'eye-off' },
    popToRoot: () => mockPopToRoot(),
    showToast: (...args: unknown[]) => mockShowToast(...args),
    Toast: { Style: { Success: 'success', Failure: 'failure' } },
    __submitHandlers: submitHandlers,
    __fieldValues: fieldValues,
    __setFieldErrors: setFieldErrors,
  };
});

import { createActionMock } from './__utils__/vicinae-mocks';
import EditSend from '../edit-send';

function makeSend(overrides: Partial<BwSend> = {}): BwSend {
  return {
    id: 'send-1',
    accessId: 'abc',
    key: 'k',
    name: 'My Text Send',
    notes: null,
    type: SendType.Text,
    password: 'secret',
    text: { text: 'hello', hidden: false },
    file: null,
    maxAccessCount: null,
    accessCount: 0,
    deletionDate: new Date().toISOString(),
    expirationDate: null,
    creationDate: new Date().toISOString(),
    revisionDate: new Date().toISOString(),
    disabled: false,
    hideEmail: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function submitForm(values: Record<string, unknown>) {
  const api = await import('@vicinae/api');
  const submit = (api as any).__submitHandlers.pop() as (
    values: Record<string, unknown>,
  ) => Promise<void>;
  await submit(values);
}

async function renderEditForm(sendOverrides: Partial<BwSend> = {}) {
  mockBw.getSend.mockResolvedValue(makeSend(sendOverrides));
  render(React.createElement(EditSend, { send: makeSend(), session: 'token', onSaved: vi.fn() }));
  await waitFor(() => screen.getByTestId('submit-save-changes'));
}

describe('EditSend', () => {
  it('renders a loading placeholder before the full send resolves', async () => {
    mockBw.getSend.mockReturnValue(new Promise(() => {}));
    render(React.createElement(EditSend, { send: makeSend(), session: 'token', onSaved: vi.fn() }));
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeTruthy();
    });
  });

  it('falls back to the prop send when bw.getSend fails', async () => {
    mockBw.getSend.mockRejectedValue(new Error('boom'));
    const send = makeSend({ name: 'Fallback Send' });
    render(React.createElement(EditSend, { send, session: 'token', onSaved: vi.fn() }));
    await waitFor(() => {
      const name = screen.getByTestId('field-name') as HTMLInputElement;
      expect(name.getAttribute('data-default')).toBe('Fallback Send');
    });
  });

  it('prefills the password field from the resolved send', async () => {
    mockBw.getSend.mockResolvedValue(makeSend({ password: 'from-server' }));
    render(React.createElement(EditSend, { send: makeSend(), session: 'token', onSaved: vi.fn() }));
    await waitFor(() => {
      const pw = screen.getByTestId('field-password') as HTMLInputElement;
      expect(pw.getAttribute('data-default')).toBe('from-server');
    });
  });

  it('rejects submit when name is empty', async () => {
    await renderEditForm();
    await submitForm({ name: '   ', textContent: 'still here' });

    expect(mockBw.editSend).not.toHaveBeenCalled();
  });

  it('rejects submit when text content is empty for a Text send', async () => {
    await renderEditForm();
    await submitForm({ name: 'ok', textContent: '   ' });

    expect(mockBw.editSend).not.toHaveBeenCalled();
  });

  it('submits a valid edit, shows success toast, calls onSaved + popToRoot', async () => {
    mockBw.getSend.mockResolvedValue(makeSend());
    mockBw.editSend.mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(
      React.createElement(EditSend, { send: makeSend({ id: 's' }), session: 'token', onSaved }),
    );
    await waitFor(() => screen.getByTestId('submit-save-changes'));
    await submitForm({ name: 'New name', textContent: 'new body', password: '' });

    expect(mockBw.editSend).toHaveBeenCalledWith(
      's',
      expect.objectContaining({ name: 'New name' }),
      'token',
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'success', title: 'Send updated' }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(mockPopToRoot).toHaveBeenCalled();
  });

  it('surfaces a failure toast when bw.editSend throws', async () => {
    mockBw.editSend.mockRejectedValue(new Error('save broke'));
    await renderEditForm();
    await submitForm({ name: 'ok', textContent: 'ok' });

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'failure', title: 'Failed to update send' }),
    );
  });

  it('Delete Send action delegates to deleteSendWithConfirm', async () => {
    mockBw.getSend.mockResolvedValue(makeSend());
    const onSaved = vi.fn();
    render(React.createElement(EditSend, { send: makeSend(), session: 'token', onSaved }));
    await waitFor(() => screen.getByTestId('action-delete-send'));
    fireEvent.click(screen.getByTestId('action-delete-send'));
    expect(mockDeleteSendWithConfirm).toHaveBeenCalled();
  });

  it('toggles the password field between PasswordField and TextField via the action', async () => {
    mockBw.getSend.mockResolvedValue(makeSend({ password: 'shh' }));
    render(React.createElement(EditSend, { send: makeSend(), session: 'token', onSaved: vi.fn() }));
    await waitFor(() => screen.getByTestId('action-show-password'));
    fireEvent.click(screen.getByTestId('action-show-password'));
    await waitFor(() => {
      expect(screen.getByTestId('action-hide-password')).toBeTruthy();
    });
  });
});
