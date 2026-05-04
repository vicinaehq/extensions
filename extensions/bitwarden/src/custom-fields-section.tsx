import { Form } from '@vicinae/api';
import { Fragment } from 'react';

export interface CustomField {
  id: number;
  name: string;
  value: string;
}

interface CustomFieldsSectionProps {
  customFields: CustomField[];
  setCustomFields: React.Dispatch<React.SetStateAction<CustomField[]>>;
  notes?: string;
}

export default function CustomFieldsSection({
  customFields,
  setCustomFields,
  notes,
}: CustomFieldsSectionProps) {
  return (
    <>
      {notes !== undefined ? (
        <Form.TextArea id="notes" title="Notes" defaultValue={notes} />
      ) : (
        <Form.TextArea id="notes" title="Notes" />
      )}

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
            onChange={(v) =>
              setCustomFields((prev) =>
                prev.map((f) => (f.id === field.id ? { ...f, name: String(v ?? '') } : f)),
              )
            }
          />
          <Form.TextField
            id={`cf_value_${field.id}`}
            title="Field Value"
            value={field.value}
            onChange={(v) =>
              setCustomFields((prev) =>
                prev.map((f) => (f.id === field.id ? { ...f, value: String(v ?? '') } : f)),
              )
            }
          />
        </Fragment>
      ))}
    </>
  );
}
