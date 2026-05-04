import { Action, ActionPanel, Detail, Icon, showToast, Toast, useNavigation } from '@vicinae/api';
import { useEffect, useState } from 'react';
import * as bw from './bw-executor';
import type { Session } from './bw-executor';
import {
  buildItemDetailMarkdown,
  itemActions as getItemActions,
  itemTypeLabel,
  actionIcon,
} from './item-utils';
import type { BwItem } from './bitwarden-types';
import { ItemType } from './bitwarden-types';
import EditItem from './edit-item';

function renderItemActionElements(
  actions: ReturnType<typeof getItemActions>,
  onCopyTotp: (id: string) => void,
  itemId: string,
  showIcons?: boolean,
) {
  return actions.map((action) => {
    if (action.label === 'Copy TOTP') {
      return (
        <Action
          key={action.label}
          title={action.label}
          icon={Icon.CopyClipboard}
          onAction={() => onCopyTotp(itemId)}
        />
      );
    }
    if (action.label === 'Open URL') {
      return (
        <Action.OpenInBrowser
          key={action.label}
          title={action.label}
          icon={Icon.Globe01}
          url={action.value}
        />
      );
    }
    return (
      <Action.CopyToClipboard
        key={action.label}
        title={action.label}
        icon={showIcons ? actionIcon(action) : undefined}
        content={action.value}
      />
    );
  });
}

function buildMetadata(
  item: BwItem,
  folderName: string | undefined,
  showPassword: boolean,
  totpCode?: string,
) {
  return (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Type" text={itemTypeLabel(item)} />
      {folderName && <Detail.Metadata.Label title="Folder" text={folderName} />}
      {renderTypeMetadata(item, showPassword, totpCode)}
      {item.fields && item.fields.length > 0 && (
        <>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Custom Fields" text="" />
          {item.fields.map((field, i) => (
            <Detail.Metadata.Label
              key={i}
              title={field.name}
              text={field.type === 1 ? '••••••••' : field.value}
            />
          ))}
        </>
      )}
    </Detail.Metadata>
  );
}

function renderTypeMetadata(item: BwItem, showPassword: boolean, totpCode?: string) {
  switch (item.type) {
    case ItemType.Login:
      return item.login ? (
        <LoginMetadata login={item.login} showPassword={showPassword} totpCode={totpCode} />
      ) : null;
    case ItemType.Card:
      return item.card ? <CardMetadata card={item.card} /> : null;
    case ItemType.Identity:
      return item.identity ? <IdentityMetadata identity={item.identity} /> : null;
    default:
      return null;
  }
}

function LoginMetadata({
  login,
  showPassword,
  totpCode,
}: {
  login: NonNullable<BwItem['login']>;
  showPassword: boolean;
  totpCode?: string;
}) {
  return (
    <>
      <Detail.Metadata.Separator />
      {login.username && <Detail.Metadata.Label title="Username" text={login.username} />}
      {login.password && (
        <Detail.Metadata.Label
          title="Password"
          text={showPassword ? login.password : '••••••••••••'}
        />
      )}
      {login.totp && <Detail.Metadata.Label title="TOTP" text={totpCode ?? 'Loading...'} />}
      {login.uris && login.uris.length > 0 && (
        <Detail.Metadata.Label title="URL" text={login.uris.map((u) => u.uri).join(', ')} />
      )}
    </>
  );
}

function CardMetadata({ card }: { card: NonNullable<BwItem['card']> }) {
  return (
    <>
      <Detail.Metadata.Separator />
      {card.cardholderName && (
        <Detail.Metadata.Label title="Cardholder" text={card.cardholderName} />
      )}
      {card.brand && <Detail.Metadata.Label title="Brand" text={card.brand} />}
      {card.number && (
        <Detail.Metadata.Label title="Number" text={`•••• ${card.number.slice(-4)}`} />
      )}
      {card.expMonth && card.expYear && (
        <Detail.Metadata.Label title="Expires" text={`${card.expMonth}/${card.expYear}`} />
      )}
      {card.code && <Detail.Metadata.Label title="Code" text="•••" />}
    </>
  );
}

function IdentityMetadata({ identity }: { identity: NonNullable<BwItem['identity']> }) {
  return (
    <>
      <Detail.Metadata.Separator />
      {identity.title && <Detail.Metadata.Label title="Title" text={identity.title} />}
      {identity.firstName && <Detail.Metadata.Label title="First Name" text={identity.firstName} />}
      {identity.lastName && <Detail.Metadata.Label title="Last Name" text={identity.lastName} />}
      {identity.email && <Detail.Metadata.Label title="Email" text={identity.email} />}
      {identity.phone && <Detail.Metadata.Label title="Phone" text={identity.phone} />}
      {(identity.address1 || identity.city) && (
        <>
          <Detail.Metadata.Separator />
          {identity.address1 && <Detail.Metadata.Label title="Address" text={identity.address1} />}
          {identity.city && <Detail.Metadata.Label title="City" text={identity.city} />}
          {identity.state && <Detail.Metadata.Label title="State" text={identity.state} />}
          {identity.postalCode && (
            <Detail.Metadata.Label title="Postal Code" text={identity.postalCode} />
          )}
          {identity.country && <Detail.Metadata.Label title="Country" text={identity.country} />}
        </>
      )}
    </>
  );
}

export { renderItemActionElements };

export default function ItemDetailView({
  item,
  session,
  onCopyTotp,
  folderName,
}: {
  item: BwItem;
  session: Session | null;
  onCopyTotp: (id: string) => Promise<void>;
  folderName?: string;
}) {
  const [fullItem, setFullItem] = useState<BwItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [totpCode, setTotpCode] = useState<string | undefined>();
  const [showPassword, setShowPassword] = useState(false);
  const { pop, push } = useNavigation();

  useEffect(() => {
    if (!session) return;
    void (async () => {
      try {
        const fetched = await bw.getItem(item.id, session);
        setFullItem(fetched);
      } catch {
        setFullItem(item);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [item.id, session]);

  useEffect(() => {
    if (!session) return;
    const resolved = fullItem ?? item;
    if (resolved.type !== ItemType.Login || !resolved.login?.totp) return;

    let active = true;
    const fetch = async () => {
      try {
        const code = await bw.getTotp(item.id, session);
        if (active) setTotpCode(code);
      } catch {
        if (active) setTotpCode(undefined);
      }
    };

    fetch();
    const interval = setInterval(fetch, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session, fullItem]);

  const resolved = fullItem ?? item;
  const markdown = buildItemDetailMarkdown(resolved);
  const actions = getItemActions(resolved);
  const resolvedFolderName = folderName ?? resolved.folderId ?? undefined;
  const metadata = buildMetadata(resolved, resolvedFolderName, showPassword, totpCode);

  return (
    <Detail
      markdown={isLoading ? 'Loading...' : markdown}
      navigationTitle={resolved.name}
      metadata={metadata}
      actions={
        <ActionPanel>
          {renderItemActionElements(actions.slice(0, 2), onCopyTotp, item.id, true)}
          {resolved.type === ItemType.Login && resolved.login?.password && (
            <Action
              title={showPassword ? 'Hide Password' : 'Show Password'}
              icon={Icon.Eye}
              onAction={() => setShowPassword((prev) => !prev)}
            />
          )}
          {renderItemActionElements(actions.slice(2), onCopyTotp, item.id, true)}
          {session && (
            <Action
              title="Edit Item"
              icon={Icon.Pencil}
              onAction={() => {
                push(
                  <EditItem
                    item={item}
                    session={session}
                    onSaved={() => {
                      setFullItem(null);
                      setIsLoading(true);
                    }}
                  />,
                );
              }}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
