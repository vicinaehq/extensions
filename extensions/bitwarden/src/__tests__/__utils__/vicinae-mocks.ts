import React from 'react';

export function makeFormMock(
  extras: Record<string, React.ComponentType<Record<string, unknown>>> = {},
) {
  return Object.assign(
    function Form({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
      return React.createElement('form', { 'data-testid': 'form' }, children, actions);
    },
    {
      PasswordField(props: { id: string; title: string; error?: string }) {
        return React.createElement('input', {
          type: 'password',
          'data-testid': props.id,
          placeholder: props.title,
        });
      },
      ...extras,
    },
  );
}

/**
 * Shared mock factory for `vi.mock('@vicinae/api', ...)`.
 * Pass your hoisted mockClipboardCopy and mockShowToast.
 */
// fallow-ignore-next-line unused-export
export function createVicinaeApiMock(
  copyFn: (...args: unknown[]) => void,
  toastFn: (...args: unknown[]) => void,
) {
  return {
    Clipboard: { copy: copyFn },
    showToast: toastFn,
    Toast: { Style: { Success: 'success', Failure: 'failure' } },
  };
}

function el(type: string, testId?: string) {
  return (props: { children?: React.ReactNode; id?: string; [key: string]: unknown }) => {
    const { children, ...rest } = props;
    return React.createElement(type, { 'data-testid': testId ?? props.id, ...rest }, children);
  };
}

const DropdownItem = el('option');
const Dropdown = Object.assign(el('select'), { Item: DropdownItem });

export function createActionMock() {
  return ({ title, onAction }: { title: string; onAction?: () => void }) =>
    React.createElement(
      'button',
      {
        'data-testid': `action-${title.replace(/\s+/g, '-').toLowerCase()}`,
        onClick: () => onAction?.(),
      },
      title,
    );
}
