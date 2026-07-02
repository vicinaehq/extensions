import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomFieldsSection from '../custom-fields-section';
import type { CustomField } from '../custom-fields-section';

// fallow-ignore-next-line code-duplication
const MockForm = vi.hoisted(() => {
  const el = (type: string, testId?: string) => {
    return (props: {
      children?: React.ReactNode;
      id?: string;
      title?: string;
      value?: string;
      defaultValue?: string;
      onChange?: (value: unknown) => void;
      label?: string;
    }) => {
      const { children, ...rest } = props;
      return React.createElement(type, { 'data-testid': testId ?? props.id, ...rest }, children);
    };
  };

  // fallow-ignore-next-line code-duplication
  const DropdownItem = el('option');
  // fallow-ignore-next-line code-duplication
  const Dropdown = Object.assign(el('select'), { Item: DropdownItem });

  return Object.assign(el('div'), {
    TextField: el('input'),
    PasswordField: el('input'),
    Checkbox: el('input'),
    TextArea: el('textarea'),
    Dropdown,
    Description: ({ text }: { text: string }) =>
      React.createElement('span', { 'data-testid': 'description' }, text),
    Separator: () => React.createElement('hr', { 'data-testid': 'separator' }),
  });
});

vi.mock('@vicinae/api', () => ({
  Form: MockForm,
}));

function makeFields(overrides: Partial<CustomField>[] = []): CustomField[] {
  return overrides.map((f, i) => ({
    id: i,
    name: '',
    value: '',
    type: 0,
    ...f,
  }));
}

describe('CustomFieldsSection', () => {
  it('renders Notes textarea', () => {
    render(
      React.createElement(CustomFieldsSection, {
        customFields: [],
        setCustomFields: vi.fn(),
        notes: 'some notes',
      }),
    );

    expect(screen.getByTestId('notes')).toBeTruthy();
  });

  it('hides custom field headers when no fields exist', () => {
    render(
      React.createElement(CustomFieldsSection, {
        customFields: [],
        setCustomFields: vi.fn(),
      }),
    );

    expect(screen.queryByTestId('separator')).toBeNull();
    expect(screen.queryByTestId('description')).toBeNull();
  });

  it('renders separator and description when custom fields exist', () => {
    render(
      React.createElement(CustomFieldsSection, {
        customFields: makeFields([{ name: 'API Key', value: 'abc', type: 0 }]),
        setCustomFields: vi.fn(),
      }),
    );

    expect(screen.getByTestId('separator')).toBeTruthy();
    expect(screen.getByTestId('description').textContent).toBe('Custom Fields');
  });

  it('renders field name, type dropdown, and value for each custom field', () => {
    render(
      React.createElement(CustomFieldsSection, {
        customFields: makeFields([
          { name: 'API Key', value: 'abc123', type: 0 },
          { name: 'PIN', value: '••••', type: 1 },
        ]),
        setCustomFields: vi.fn(),
      }),
    );

    expect(screen.getByTestId('cf_name_0')).toBeTruthy();
    expect(screen.getByTestId('cf_type_0')).toBeTruthy();
    expect(screen.getByTestId('cf_value_0')).toBeTruthy();
    expect(screen.getByTestId('cf_name_1')).toBeTruthy();
    expect(screen.getByTestId('cf_type_1')).toBeTruthy();
    expect(screen.getByTestId('cf_value_1')).toBeTruthy();
  });

  it('renders appropriate input per field type', () => {
    render(
      React.createElement(CustomFieldsSection, {
        customFields: makeFields([
          { name: 'API Key', value: 'abc', type: 0 },
          { name: 'Secret', value: 'xyz', type: 1 },
          { name: 'Flag', value: 'true', type: 2 },
        ]),
        setCustomFields: vi.fn(),
      }),
    );

    expect(screen.getByTestId('cf_value_0').tagName).toBe('INPUT');
    expect(screen.getByTestId('cf_value_1')).toBeTruthy();
    expect(screen.getByTestId('cf_value_2')).toBeTruthy();
  });

  it('calls setCustomFields on field type change', () => {
    const setCustomFields = vi.fn();

    render(
      React.createElement(CustomFieldsSection, {
        customFields: makeFields([{ name: 'Flag', value: 'hello', type: 0 }]),
        setCustomFields,
      }),
    );

    fireEvent.change(screen.getByTestId('cf_type_0'), { target: { value: '2' } });

    expect(setCustomFields).toHaveBeenCalled();
  });
});
