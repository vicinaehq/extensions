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
import { useCallback, useEffect, useRef, useState } from 'react';
import * as bw from './bw-executor';
import { logError } from './log';
import type { BwFolder } from './bitwarden-types';
import { ItemType } from './bitwarden-types';
import type { ItemTypeValue } from './bitwarden-types';
import { CARD_BRANDS, readFormValues, toCreatePayload, uploadAttachments } from './item-form';
import { showFailureToast } from './toast';
import CustomFieldsSection from './custom-fields-section';
import type { CustomField } from './custom-fields-section';
import { useSession } from './use-session';
import { getPasswordPrefs, getPreferences } from './preferences';
import { renderFormGate, useGateEffects, castGateSetter } from './unlock-gate';
import type { GateUIState } from './unlock-gate';
import { useCardFields } from './use-card-fields';

type UIState = GateUIState | { kind: 'form' };

const ITEM_TYPE_MAP: Record<string, ItemTypeValue> = {
  Login: ItemType.Login,
  Card: ItemType.Card,
  Identity: ItemType.Identity,
  'Secure Note': ItemType.SecureNote,
};

const ITEM_TYPE_OPTIONS = Object.keys(ITEM_TYPE_MAP).map((label) => ({
  value: label,
  label,
}));

async function createFolderIfNeeded(
  newFolderName: string | undefined,
  session: bw.Session,
): Promise<string | null> {
  const name = (newFolderName ?? '').trim();
  if (!name) {
    await showToast({ style: Toast.Style.Failure, title: 'Folder name is required' });
    return null;
  }
  try {
    const created = await bw.createFolder(name, session);
    await showToast({ style: Toast.Style.Success, title: 'Folder created', message: name });
    return created.id;
  } catch (err) {
    await showFailureToast(err, 'Failed to create folder');
    return null;
  }
}

export default function CreateItem() {
  const { session, unlock, loginIfNeeded, loginError } = useSession();
  const [state, setState] = useState<UIState>({ kind: 'checking-bw' });
  const [selectedType, setSelectedType] = useState<string>('Login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [folders, setFolders] = useState<BwFolder[]>([]);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>([]);
  const { expMonth, setExpMonth, expYear, setExpYear, cardCode, setCardCode } = useCardFields();
  const [nameError, setNameError] = useState<string | undefined>();
  const fieldIdRef = useRef(0);

  const { handleLogin, handleUnlock, clearGateError } = useGateEffects({
    session,
    state,
    loginIfNeeded,
    loginError,
    unlock,
    setState: castGateSetter(setState),
    readyKind: 'form',
  });

  // Fetch folders — starts as soon as session is available, before form renders
  useEffect(() => {
    if (!session) return;
    if (folders.length > 0) return;
    void (async () => {
      try {
        setFolders(await bw.listFolders(session));
      } catch (err) {
        logError('createItem.listFolders', err);
      }
    })();
  }, [session, state.kind, folders.length]);

  const handleSubmit = useCallback(
    async (values: Form.Values) => {
      if (!session) return;

      const itemValues = readFormValues(values);
      if (!itemValues.name?.trim()) {
        setNameError('Name is required');
        return;
      }
      const typeNum = ITEM_TYPE_MAP[selectedType] ?? ItemType.SecureNote;
      let folderId = itemValues.folder || null;

      if (folderId === '__new__') {
        const createdFolderId = await createFolderIfNeeded(itemValues.newFolderName, session);
        if (!createdFolderId) return;
        folderId = createdFolderId;
      }

      setIsSubmitting(true);
      try {
        const payload = toCreatePayload(
          itemValues,
          typeNum,
          folderId === '' ? null : folderId,
          customFields.length > 0
            ? customFields.map((f) => ({ name: f.name, value: f.value, type: f.type }))
            : undefined,
        );
        const created = await bw.createItem(payload, session);

        await uploadAttachments(created.id, attachmentPaths, session);

        await showToast({
          style: Toast.Style.Success,
          title: 'Item created',
          message: itemValues.name,
        });
        await popToRoot();
      } catch (err) {
        await showFailureToast(err, 'Failed to create item');
      } finally {
        setIsSubmitting(false);
      }
    },
    [session, selectedType, customFields, attachmentPaths],
  );

  const gateRender = renderFormGate(state, handleUnlock, handleLogin, clearGateError);
  if (gateRender) return gateRender;

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Item" icon={Icon.Plus} onSubmit={handleSubmit} />
          {selectedType === 'Login' && (
            <>
              <Action
                title={showPassword ? 'Hide Password' : 'Show Password'}
                icon={Icon.Eye}
                onAction={() => setShowPassword((prev) => !prev)}
              />
              <Action
                title="Generate Password"
                icon={Icon.Key}
                onAction={async () => {
                  try {
                    const prefs = getPreferences();
                    const opts = getPasswordPrefs(prefs);
                    const pwd = await bw.generatePassword(opts);
                    setGeneratedPassword(pwd);
                    await Clipboard.copy(pwd);
                    showToast({
                      style: Toast.Style.Success,
                      title: 'Password generated',
                      message: 'Copied to clipboard',
                    });
                  } catch (err) {
                    await showFailureToast(err, 'Generation failed');
                  }
                }}
              />
            </>
          )}
          <Action
            title="Add Custom Field"
            icon={Icon.Plus}
            onAction={() =>
              setCustomFields((prev) => [
                ...prev,
                { id: fieldIdRef.current++, name: '', value: '', type: 0 },
              ])
            }
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="itemType"
        title="Item Type"
        value={selectedType}
        onChange={(value) => setSelectedType(String(value ?? 'Login'))}
      >
        {ITEM_TYPE_OPTIONS.map((opt) => (
          <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.label} />
        ))}
      </Form.Dropdown>

      {folders.length > 0 && (
        <Form.Dropdown
          id="folder"
          title="Folder"
          value={selectedFolder}
          onChange={(value) => setSelectedFolder(String(value ?? ''))}
        >
          {folders.map((f) => (
            <Form.Dropdown.Item key={f.id} value={f.id} title={f.name} />
          ))}
          <Form.Dropdown.Item value="__new__" title="+ New Folder" />
        </Form.Dropdown>
      )}

      {selectedFolder === '__new__' && (
        <Form.TextField
          id="newFolderName"
          title="Folder Name"
          value={newFolderName}
          onChange={(value) => setNewFolderName(String(value ?? ''))}
        />
      )}

      <Form.Separator />

      <Form.TextField
        id="name"
        title="Name *"
        error={nameError}
        onChange={() => nameError && setNameError(undefined)}
      />

      {selectedType === 'Login' && (
        <>
          <Form.TextField id="username" title="Username" />
          {showPassword ? (
            <Form.TextField
              id="password"
              title="Password"
              value={generatedPassword}
              onChange={(value) => setGeneratedPassword(String(value ?? ''))}
            />
          ) : (
            <Form.PasswordField
              id="password"
              title="Password"
              value={generatedPassword}
              onChange={(value) => setGeneratedPassword(String(value ?? ''))}
            />
          )}
          <Form.TextField id="url" title="URL" />
          <Form.TextField id="totp" title="TOTP Secret" />
        </>
      )}

      {selectedType === 'Card' && (
        <>
          <Form.TextField id="cardholderName" title="Cardholder Name" />
          <Form.Dropdown id="brand" title="Brand" defaultValue="Other">
            {CARD_BRANDS.map((b) => (
              <Form.Dropdown.Item key={b} value={b} title={b} />
            ))}
          </Form.Dropdown>
          <Form.TextField id="number" title="Card Number" />
          <Form.TextField
            id="expMonth"
            title="Expiration Month"
            value={expMonth}
            onChange={setExpMonth}
          />
          <Form.TextField
            id="expYear"
            title="Expiration Year"
            value={expYear}
            onChange={setExpYear}
          />
          <Form.TextField id="code" title="Security Code" value={cardCode} onChange={setCardCode} />
        </>
      )}

      {selectedType === 'Identity' && (
        <>
          <Form.TextField id="title" title="Title" />
          <Form.TextField id="firstName" title="First Name" />
          <Form.TextField id="middleName" title="Middle Name" />
          <Form.TextField id="lastName" title="Last Name" />
          <Form.TextField id="email" title="Email" />
          <Form.TextField id="phone" title="Phone" />
          <Form.Separator />
          <Form.TextField id="address1" title="Address Line 1" />
          <Form.TextField id="address2" title="Address Line 2" />
          <Form.TextField id="city" title="City" />
          <Form.TextField id="state" title="State" />
          <Form.TextField id="postalCode" title="Postal Code" />
          <Form.TextField id="country" title="Country" />
        </>
      )}

      {selectedType === 'Secure Note' && (
        <Form.Description text="A Secure Note stores arbitrary text. Use the Notes field below for the content." />
      )}

      <Form.Separator />

      <CustomFieldsSection customFields={customFields} setCustomFields={setCustomFields} />

      <Form.Separator />

      <Form.FilePicker
        id="attachments"
        title="Attachments"
        allowMultipleSelection
        value={attachmentPaths}
        onChange={(paths: string[]) => setAttachmentPaths(paths)}
      />
    </Form>
  );
}
