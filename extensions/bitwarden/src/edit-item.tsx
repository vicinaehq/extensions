import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Form,
  Icon,
  popToRoot,
  showToast,
  Toast,
} from '@vicinae/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as bw from './bw-executor';
import { showFailureToast } from './item-utils';
import type { BwFolder, BwItem } from './bitwarden-types';
import { ItemType } from './bitwarden-types';
import type { ItemTypeValue } from './bitwarden-types';
import {
  CARD_BRANDS,
  digitsOnly,
  itemTypeLabel,
  toCreatePayload,
  uploadAttachments,
} from './item-utils';
import CustomFieldsSection, { type CustomField } from './custom-fields-section';

interface EditItemProps {
  item: BwItem;
  session: string;
  onSaved: () => void;
}

function renderLoginFields(login: NonNullable<BwItem['login']>, showPassword: boolean) {
  return (
    <>
      <Form.TextField id="username" title="Username" defaultValue={login.username ?? ''} />
      {showPassword ? (
        <Form.TextField id="password" title="Password" defaultValue={login.password ?? ''} />
      ) : (
        <Form.PasswordField id="password" title="Password" defaultValue={login.password ?? ''} />
      )}
      <Form.TextField id="url" title="URL" defaultValue={login.uris?.[0]?.uri ?? ''} />
      <Form.TextField id="totp" title="TOTP Secret" defaultValue={login.totp ?? ''} />
    </>
  );
}

function renderCardFields(
  card: NonNullable<BwItem['card']>,
  expMonth: string,
  expYear: string,
  cardCode: string,
  onExpMonthChange: (v: string) => void,
  onExpYearChange: (v: string) => void,
  onCardCodeChange: (v: string) => void,
) {
  return (
    <>
      <Form.TextField
        id="cardholderName"
        title="Cardholder Name"
        defaultValue={card.cardholderName ?? ''}
      />
      <Form.Dropdown id="brand" title="Brand" defaultValue={card.brand ?? 'Other'}>
        {CARD_BRANDS.map((b) => (
          <Form.Dropdown.Item key={b} value={b} title={b} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="number" title="Card Number" defaultValue={card.number ?? ''} />
      <Form.TextField
        id="expMonth"
        title="Expiration Month"
        value={expMonth}
        onChange={(v) => onExpMonthChange(v)}
      />
      <Form.TextField
        id="expYear"
        title="Expiration Year"
        value={expYear}
        onChange={(v) => onExpYearChange(v)}
      />
      <Form.TextField
        id="code"
        title="Security Code"
        value={cardCode}
        onChange={(v) => onCardCodeChange(v)}
      />
    </>
  );
}

function renderIdentityFields(identity: NonNullable<BwItem['identity']>) {
  return (
    <>
      <Form.TextField id="title" title="Title" defaultValue={identity.title ?? ''} />
      <Form.TextField id="firstName" title="First Name" defaultValue={identity.firstName ?? ''} />
      <Form.TextField
        id="middleName"
        title="Middle Name"
        defaultValue={identity.middleName ?? ''}
      />
      <Form.TextField id="lastName" title="Last Name" defaultValue={identity.lastName ?? ''} />
      <Form.TextField id="email" title="Email" defaultValue={identity.email ?? ''} />
      <Form.TextField id="phone" title="Phone" defaultValue={identity.phone ?? ''} />
      <Form.Separator />
      <Form.TextField id="address1" title="Address Line 1" defaultValue={identity.address1 ?? ''} />
      <Form.TextField id="address2" title="Address Line 2" defaultValue={identity.address2 ?? ''} />
      <Form.TextField id="city" title="City" defaultValue={identity.city ?? ''} />
      <Form.TextField id="state" title="State" defaultValue={identity.state ?? ''} />
      <Form.TextField
        id="postalCode"
        title="Postal Code"
        defaultValue={identity.postalCode ?? ''}
      />
      <Form.TextField id="country" title="Country" defaultValue={identity.country ?? ''} />
    </>
  );
}

export default function EditItem({ item, session, onSaved }: EditItemProps) {
  const [fullItem, setFullItem] = useState<BwItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [folders, setFolders] = useState<BwFolder[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cardCode, setCardCode] = useState('');
  const fieldIdRef = useRef(0);

  useEffect(() => {
    void (async () => {
      let resolved: BwItem;
      try {
        resolved = await bw.getItem(item.id, session);
      } catch {
        resolved = item;
      }

      setFullItem(resolved);

      if (resolved.card) {
        setExpMonth(resolved.card.expMonth ?? '');
        setExpYear(resolved.card.expYear ?? '');
        setCardCode(resolved.card.code ?? '');
      }

      if (resolved.fields && resolved.fields.length > 0) {
        setCustomFields(
          resolved.fields.map((f, i) => ({
            id: i,
            name: f.name,
            value: f.value,
            type: f.type,
          })),
        );
        fieldIdRef.current = resolved.fields.length;
      }

      setIsLoading(false);

      try {
        setFolders(await bw.listFolders(session));
      } catch {
        // Folder list is optional
      }
    })();
  }, [item.id, session]);

  const handleSubmit = useCallback(
    async (values: Form.Values) => {
      setIsSubmitting(true);
      try {
        const formValues: Record<string, string> = {};
        for (const [key, val] of Object.entries(values)) {
          formValues[key] = String(val ?? '');
        }

        const fields =
          customFields.length > 0
            ? customFields.map((f) => ({ name: f.name, value: f.value, type: f.type }))
            : undefined;

        const payload = toCreatePayload(formValues, item.type, formValues.folder || null, fields);
        await bw.editItem(item.id, payload, session);

        await uploadAttachments(item.id, attachmentPaths, session);

        await showToast({
          style: Toast.Style.Success,
          title: 'Item updated',
          message: formValues.name,
        });
        onSaved();
        await popToRoot();
      } catch (err) {
        await showFailureToast(err, 'Failed to update item');
      } finally {
        setIsSubmitting(false);
      }
    },
    [item.id, item.type, session, onSaved, customFields, attachmentPaths],
  );

  const handleDelete = useCallback(async () => {
    const confirmed = await confirmAlert({
      title: 'Delete Item',
      message: `Are you sure you want to delete "${item.name}"?`,
      primaryAction: {
        title: 'Delete',
        style: Alert.ActionStyle.Destructive,
      },
    });
    if (!confirmed) return;
    try {
      await bw.deleteItem(item.id, session);
      await showToast({ style: Toast.Style.Success, title: 'Item deleted', message: item.name });
      onSaved();
      await popToRoot();
    } catch (err) {
      await showFailureToast(err, 'Delete failed');
    }
  }, [item.id, item.name, session, onSaved]);

  if (isLoading || !fullItem) {
    return (
      <Form>
        <Form.Description text="Loading..." />
      </Form>
    );
  }

  const typeLabel = itemTypeLabel(item);
  const folderId = fullItem.folderId ?? '';

  return (
    <Form
      isLoading={isSubmitting}
      navigationTitle={`Edit ${fullItem.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Changes" icon={Icon.CheckCircle} onSubmit={handleSubmit} />
          {item.type === ItemType.Login && fullItem.login?.password && (
            <Action
              title={showPassword ? 'Hide Password' : 'Show Password'}
              icon={Icon.Eye}
              onAction={() => setShowPassword((prev) => !prev)}
            />
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
          <Action title="Delete Item" icon={Icon.Trash} onAction={handleDelete} />
        </ActionPanel>
      }
    >
      <Form.Description text={`Type: ${typeLabel}`} />

      {folders.length > 0 && (
        <Form.Dropdown id="folder" title="Folder" defaultValue={folderId}>
          {folders.map((f) => (
            <Form.Dropdown.Item key={f.id} value={f.id} title={f.name} />
          ))}
        </Form.Dropdown>
      )}

      <Form.Separator />

      <Form.TextField id="name" title="Name" defaultValue={fullItem.name} />

      {item.type === ItemType.Login &&
        fullItem.login &&
        renderLoginFields(fullItem.login, showPassword)}

      {item.type === ItemType.Card &&
        fullItem.card &&
        renderCardFields(
          fullItem.card,
          expMonth,
          expYear,
          cardCode,
          (v) => setExpMonth(digitsOnly(v)),
          (v) => setExpYear(digitsOnly(v)),
          (v) => setCardCode(digitsOnly(v)),
        )}

      {item.type === ItemType.Identity &&
        fullItem.identity &&
        renderIdentityFields(fullItem.identity)}

      {item.type === ItemType.SecureNote && (
        <Form.Description text="A Secure Note stores arbitrary text. Use the Notes field below for the content." />
      )}

      <Form.Separator />

      <CustomFieldsSection
        customFields={customFields}
        setCustomFields={setCustomFields}
        notes={fullItem.notes ?? ''}
      />

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
