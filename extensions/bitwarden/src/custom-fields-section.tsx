import { Form } from '@vicinae/api';
import { Fragment } from 'react';

export interface CustomField {
  id: number;
  name: string;
  value: string;
  type: number; // 0=Text, 1=Hidden, 2=Boolean
}

const FIELD_TYPES = [
  { title: 'Text', value: '0' },
  { title: 'Hidden', value: '1' },
  { title: 'Boolean', value: '2' },
];

interface CustomFieldsSectionProps {
  customFields: CustomField[];
  setCustomFields: React.Dispatch<React.SetStateAction<CustomField[]>>;
  notes?: string;
}

function updateField(
  setCustomFields: React.Dispatch<React.SetStateAction<CustomField[]>>,
  fieldId: number,
  patch: Partial<Omit<CustomField, 'id'>>,
) {
  setCustomFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
}

function renderFieldValue(
  field: CustomField,
  setCustomFields: React.Dispatch<React.SetStateAction<CustomField[]>>,
) {
  if (field.type === 1) {
    return (
      <Form.PasswordField
        id={`cf_value_${field.id}`}
        title="Field Value"
        value={field.value}
        onChange={(v) => updateField(setCustomFields, field.id, { value: String(v ?? '') })}
      />
    );
  }
  if (field.type === 2) {
    return (
      <Form.Checkbox
        id={`cf_value_${field.id}`}
        label="Field Value"
        value={field.value === 'true'}
        onChange={(v) => updateField(setCustomFields, field.id, { value: String(!!v) })}
      />
    );
  }
  return (
    <Form.TextField
      id={`cf_value_${field.id}`}
      title="Field Value"
      value={field.value}
      onChange={(v) => updateField(setCustomFields, field.id, { value: String(v ?? '') })}
    />
  );
}

function normalizeBoolean(value: string): string {
  return value === 'true' ? 'true' : 'false';
}

export default function CustomFieldsSection({
  customFields,
  setCustomFields,
  notes,
}: CustomFieldsSectionProps) {
  return (
    <>
      <Form.TextArea id="notes" title="Notes" defaultValue={notes} />

      {customFields.length > 0 && (
        <>
          <Form.Separator />
          <Form.Description text="Custom Fields" />
        </>
      )}
      {customFields.map((field) => (
        <Fragment key={field.id}>
          <Form.TextField
            id={`cf_name_${field.id}`}
            title="Field Name"
            value={field.name}
            onChange={(v) => updateField(setCustomFields, field.id, { name: String(v ?? '') })}
          />
          <Form.Dropdown
            id={`cf_type_${field.id}`}
            title="Field Type"
            value={String(field.type)}
            onChange={(v) => {
              const newType = Number(v ?? '0');
              const value = newType === 2 ? normalizeBoolean(field.value) : field.value;
              updateField(setCustomFields, field.id, { type: newType, value });
            }}
          >
            {FIELD_TYPES.map((ft) => (
              <Form.Dropdown.Item key={ft.value} value={ft.value} title={ft.title} />
            ))}
          </Form.Dropdown>
          {renderFieldValue(field, setCustomFields)}
        </Fragment>
      ))}
    </>
  );
}
