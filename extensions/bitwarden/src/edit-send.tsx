import { Action, ActionPanel, Form, Icon, popToRoot, showToast, Toast } from '@vicinae/api';
import { useCallback, useEffect, useState } from 'react';
import * as bw from './bw-executor';
import { showFailureToast } from './item-utils';
import { SendType, type BwSend } from './send-types';
import { readFormValues } from './item-utils';
import {
  deleteSendWithConfirm,
  sendTypeLabel,
  toSendPayload,
  EDIT_HOURS_OPTIONS,
} from './send-utils';

interface EditSendProps {
  send: BwSend;
  session: string;
  onSaved: () => void;
}

export default function EditSend({ send, session, onSaved }: EditSendProps) {
  const [fullSend, setFullSend] = useState<BwSend | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [textError, setTextError] = useState<string | undefined>();

  const type = send.type;

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return 'Not set';
    return new Date(iso).toLocaleString();
  }

  useEffect(() => {
    void (async () => {
      let resolved: BwSend;
      try {
        resolved = await bw.getSend(send.id, session);
      } catch {
        resolved = send;
      }
      setFullSend(resolved);
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send.id, session]);

  const handleSubmit = useCallback(
    async (values: Form.Values) => {
      const sendValues = readFormValues(values);
      let hasError = false;
      if (!sendValues.name?.trim()) {
        setNameError('Name is required');
        hasError = true;
      }
      if (type === SendType.Text && !sendValues.textContent?.trim()) {
        setTextError('Text content is required');
        hasError = true;
      }
      if (hasError) return;
      setIsSubmitting(true);
      try {
        const payload = toSendPayload(sendValues, type);
        await bw.editSend(send.id, payload, session);
        await showToast({
          style: Toast.Style.Success,
          title: 'Send updated',
          message: sendValues.name,
        });
        onSaved();
        await popToRoot();
      } catch (err) {
        await showFailureToast(err, 'Failed to update send');
      } finally {
        setIsSubmitting(false);
      }
    },
    [send.id, type, session, onSaved],
  );

  const handleDelete = useCallback(async () => {
    await deleteSendWithConfirm(send, session, async () => {
      onSaved();
      await popToRoot();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send.id, send.name, session, onSaved]);

  if (isLoading || !fullSend) {
    return (
      <Form>
        <Form.Description text="Loading..." />
      </Form>
    );
  }

  return (
    <Form
      isLoading={isSubmitting}
      navigationTitle={`Edit ${fullSend.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Changes" icon={Icon.CheckCircle} onSubmit={handleSubmit} />
          <Action
            title={showPassword ? 'Hide Password' : 'Show Password'}
            icon={showPassword ? Icon.EyeDisabled : Icon.Eye}
            onAction={() => setShowPassword((prev) => !prev)}
          />
          <Action title="Delete Send" icon={Icon.Trash} onAction={handleDelete} />
        </ActionPanel>
      }
    >
      <Form.Description text={`Type: ${sendTypeLabel(fullSend)}`} />

      <Form.Separator />

      <Form.TextField
        id="name"
        title="Name *"
        defaultValue={fullSend.name}
        error={nameError}
        onChange={() => nameError && setNameError(undefined)}
      />

      {type === SendType.Text && (
        <>
          <Form.TextArea
            id="textContent"
            title="Text Content *"
            defaultValue={fullSend.text?.text ?? ''}
            error={textError}
            onChange={() => textError && setTextError(undefined)}
          />
          <Form.Checkbox
            id="hideText"
            title="Hide Text"
            label="Require access to view text"
            defaultValue={fullSend.text?.hidden}
          />
        </>
      )}

      {type === SendType.File && (
        <Form.TextField
          id="fileName"
          title="File Name"
          defaultValue={fullSend.file?.fileName ?? ''}
        />
      )}

      <Form.Separator />

      {showPassword ? (
        <Form.TextField
          id="password"
          title="Password"
          defaultValue={fullSend.password ?? send.password ?? ''}
        />
      ) : (
        <Form.PasswordField
          id="password"
          title="Password"
          defaultValue={fullSend.password ?? send.password ?? ''}
        />
      )}

      <Form.Dropdown id="deletionHours" title="Deletion Date" defaultValue="-1">
        {EDIT_HOURS_OPTIONS.map((opt) => (
          <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.title} />
        ))}
      </Form.Dropdown>
      <Form.Description text={`Current deletion: ${formatDate(fullSend.deletionDate)}`} />

      <Form.Dropdown id="expirationHours" title="Expiration Date" defaultValue="-1">
        {EDIT_HOURS_OPTIONS.map((opt) => (
          <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.title} />
        ))}
      </Form.Dropdown>
      <Form.Description text={`Current expiration: ${formatDate(fullSend.expirationDate)}`} />

      <Form.Checkbox
        id="hideEmail"
        title="Privacy"
        label="Hide email from recipients"
        defaultValue={fullSend.hideEmail}
      />
      <Form.Checkbox
        id="disabled"
        title="Status"
        label="Deactivate send"
        defaultValue={fullSend.disabled}
      />

      <Form.Separator />

      <Form.TextArea id="notes" title="Notes" defaultValue={fullSend.notes ?? ''} />
    </Form>
  );
}
