import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Create mock components
const ListSection = ({ title, children }: any) => React.createElement('div', { 'data-testid': 'list-section' }, title && React.createElement('div', {}, title), children);
const ListItem = ({ title, subtitle, children }: any) => React.createElement('div', { 'data-testid': 'list-item' }, React.createElement('div', {}, title), subtitle && React.createElement('div', {}, subtitle), children);
const FormDropdown = ({ title, children }: any) => React.createElement('div', { 'data-testid': 'form-dropdown' }, React.createElement('label', {}, title), children);
const FormDropdownItem = ({ title, value }: any) => React.createElement('option', { value }, title);
const FormTextArea = ({ title }: any) => React.createElement('div', { 'data-testid': 'form-textarea' }, React.createElement('label', {}, title));
const ActionPanelSubmenu = ({ title, children }: any) => React.createElement('div', { 'data-testid': 'action-submenu' }, React.createElement('div', {}, title), children);

// Mock Vicinae API with component stubs
vi.mock('@vicinae/api', () => ({
  LocalStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
  Toast: {
    Style: {
      Success: 'success',
      Failure: 'failure',
    },
  },
  showToast: vi.fn(),
  getPreferenceValues: vi.fn(() => ({
    ollamaServer: 'http://localhost:11434',
    chatHistoryMessagesNumber: '20',
  })),
  Action: Object.assign(
    ({ title, onAction }: any) => React.createElement('button', { onClick: onAction }, title),
    {
      Style: {
        Destructive: 'destructive',
      },
      SubmitForm: ({ title, onSubmit }: any) => React.createElement('button', { onClick: onSubmit }, title),
      Push: ({ title }: any) => React.createElement('button', {}, title),
      CopyToClipboard: ({ title }: any) => React.createElement('button', {}, title),
    }
  ),
  ActionPanel: Object.assign(
    ({ children }: any) => React.createElement('div', { 'data-testid': 'action-panel' }, children),
    { Submenu: ActionPanelSubmenu }
  ),
  List: Object.assign(
    ({ children, navigationTitle }: any) => React.createElement('div', { 'data-testid': 'list' }, navigationTitle && React.createElement('div', {}, navigationTitle), children),
    { Section: ListSection, Item: ListItem }
  ),
  Form: Object.assign(
    ({ children, navigationTitle, actions }: any) => React.createElement('div', { 'data-testid': 'form' }, navigationTitle && React.createElement('div', {}, navigationTitle), children, actions),
    {
      Dropdown: Object.assign(
        FormDropdown,
        { Item: FormDropdownItem }
      ),
      TextArea: FormTextArea
    }
  ),
  Detail: ({ navigationTitle, markdown }: any) => React.createElement('div', { 'data-testid': 'detail' }, navigationTitle && React.createElement('div', {}, navigationTitle), markdown && React.createElement('div', {}, markdown)),
}));

