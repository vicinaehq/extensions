// fallow-ignore-file unused-file
import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  popToRoot,
  showToast,
  Toast,
} from '@vicinae/api';
import { useCallback, useState } from 'react';
import * as bw from './bw-executor';
import { SendType, type SendTypeValue } from './send-types';
import { sendAccessUrl, toSendPayload, HOURS_OPTIONS } from './send-utils';
import { digitsOnly, readFormValues, showFailureToast } from './item-utils';
import { useSession } from './use-session';
import { renderFormGate, useGateEffects, castGateSetter } from './unlock-gate';
import type { GateUIState } from './unlock-gate';

type UIState = GateUIState | { kind: 'form' };

const SEND_TYPE_MAP: Record<string, SendTypeValue> = {
  Text: SendType.Text,
  File: SendType.File,
};

const SEND_TYPE_OPTIONS = Object.keys(SEND_TYPE_MAP).map((label) => ({
  value: label,
  label,
}));

export default function CreateSend() {
  const { session, unlock, loginIfNeeded, loginError } = useSession();
  const [state, setState] = useState<UIState>({ kind: 'checking-bw' });
  const [selectedType, setSelectedType] = useState<string>('Text');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [maxAccessCount, setMaxAccessCount] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [textError, setTextError] = useState<string | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();

  const { handleLogin, handleUnlock } = useGateEffects({
    session,
    state,
    loginIfNeeded,
    loginError,
    unlock,
    setState: castGateSetter(setState),
    readyKind: 'form',
  });

  const handleSubmit = useCallback(
    async (values: Form.Values) => {
      if (!session) return;

      const sendValues = readFormValues(values);
      const typeNum = SEND_TYPE_MAP[selectedType] ?? SendType.Text;
      const rawFile = Array.isArray(values.file) ? values.file[0] : undefined;
      const filePath = typeNum === SendType.File && rawFile != null ? String(rawFile) : undefined;

      let hasError = false;
      if (!sendValues.name?.trim()) {
        setNameError('Name is required');
        hasError = true;
      }
      if (typeNum === SendType.Text && !sendValues.textContent?.trim()) {
        setTextError('Text content is required');
        hasError = true;
      }
      if (typeNum === SendType.File && !filePath) {
        setFileError('File is required');
        hasError = true;
      }
      if (hasError) return;

      setIsSubmitting(true);
      try {
        const payload = toSendPayload({ ...sendValues, filePath: filePath ?? '' }, typeNum);
        const created = await bw.createSend(payload, session, filePath);
        const url = sendAccessUrl(created);
        await Clipboard.copy(url);
        await showToast({
          style: Toast.Style.Success,
          title: 'Send created',
          message: 'Link copied to clipboard',
        });
        await popToRoot();
      } catch (err) {
        await showFailureToast(err, 'Failed to create send');
      } finally {
        setIsSubmitting(false);
      }
    },
    [session, selectedType],
  );

  const gateRender = renderFormGate(state, handleUnlock, handleLogin);
  if (gateRender) return gateRender;

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Send" icon={Icon.Plus} onSubmit={handleSubmit} />
          <Action
            title={showPassword ? 'Hide Password' : 'Show Password'}
            icon={showPassword ? Icon.EyeDisabled : Icon.Eye}
            onAction={() => setShowPassword((prev) => !prev)}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="sendType"
        title="Type"
        value={selectedType}
        onChange={(value) => setSelectedType(String(value ?? 'Text'))}
      >
        {SEND_TYPE_OPTIONS.map((opt) => (
          <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.label} />
        ))}
      </Form.Dropdown>

      <Form.Separator />

      <Form.TextField
        id="name"
        title="Name *"
        error={nameError}
        onChange={() => nameError && setNameError(undefined)}
      />

      {selectedType === 'Text' && (
        <>
          <Form.TextArea
            id="textContent"
            title="Text Content *"
            error={textError}
            onChange={() => textError && setTextError(undefined)}
          />
          <Form.Checkbox id="hideText" title="Hide Text" label="Require access to view text" />
        </>
      )}

      {selectedType === 'File' && (
        <Form.FilePicker
          id="file"
          title="File *"
          allowMultipleSelection={false}
          error={fileError}
          onChange={() => fileError && setFileError(undefined)}
        />
      )}

      <Form.Separator />

      {showPassword ? (
        <Form.TextField id="password" title="Password (optional)" />
      ) : (
        <Form.PasswordField id="password" title="Password (optional)" />
      )}

      <Form.Dropdown id="deletionHours" title="Deletion Date" defaultValue="168">
        {HOURS_OPTIONS.map((opt) => (
          <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.title} />
        ))}
      </Form.Dropdown>

      <Form.Dropdown id="expirationHours" title="Expiration Date" defaultValue="0">
        {HOURS_OPTIONS.map((opt) => (
          <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.title} />
        ))}
      </Form.Dropdown>

      <Form.TextField
        id="maxAccessCount"
        title="Max Accesses"
        value={maxAccessCount}
        onChange={(v) => setMaxAccessCount(digitsOnly(v))}
      />

      <Form.Checkbox id="hideEmail" title="Privacy" label="Hide email from recipients" />

      <Form.Checkbox id="disabled" title="Status" label="Deactivate send" />

      <Form.Separator />

      <Form.TextArea id="notes" title="Notes (optional)" />
    </Form>
  );
}
