import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from '@vicinae/api';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { useEffect, useState } from 'react';
import * as bw from './bw-executor';
import type { Session } from './bw-executor';
import {
  buildItemDetailMarkdown,
  formatTotp,
  itemActions as getItemActions,
  itemTypeLabel,
  actionIcon,
} from './item-utils';
import type { BwField, BwItem } from './bitwarden-types';
import { ItemType } from './bitwarden-types';
import EditItem from './edit-item';

const exec = promisify(execFile);

function resolveFetchValue(fetchKind: string, item: BwItem): string | undefined {
  switch (fetchKind) {
    case 'password':
      return item.login?.password ?? undefined;
    case 'cardNumber':
      return item.card?.number ?? undefined;
    case 'cardCode':
      return item.card?.code ?? undefined;
    default:
      return undefined;
  }
}

function renderItemActionElements(
  actions: ReturnType<typeof getItemActions>,
  onCopyTotp: (id: string) => void,
  itemId: string,
  session: Session | null,
  showIcons?: boolean,
) {
  return actions.map((action) => {
    if (action.fetchKind === 'totp' || action.label === 'Copy Verification Code') {
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
    if (action.fetchKind && session) {
      const kind = action.fetchKind;
      return (
        <Action
          key={action.label}
          title={action.label}
          icon={Icon.CopyClipboard}
          onAction={async () => {
            try {
              const fullItem = await bw.getItem(itemId, session);
              const value = resolveFetchValue(kind, fullItem);
              if (value) {
                await Clipboard.copy(value);
                await showToast({
                  style: Toast.Style.Success,
                  title: action.label,
                });
              }
            } catch {
              await showToast({
                style: Toast.Style.Failure,
                title: 'Failed to copy',
              });
            }
          }}
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

function fieldDisplayText(field: BwField, revealed: boolean): string {
  if (field.type === 1) {
    return revealed ? field.value : '••••••••';
  }
  if (field.type === 2) {
    return field.value === 'true' ? 'Yes' : 'No';
  }
  return field.value;
}

function buildMetadata(
  item: BwItem,
  folderName: string | undefined,
  showPassword: boolean,
  revealedFields: Set<number>,
  totpCode?: string,
  totpCountdown?: number,
) {
  return (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Type" text={itemTypeLabel(item)} />
      {folderName && <Detail.Metadata.Label title="Folder" text={folderName} />}
      {renderTypeMetadata(item, showPassword, totpCode, totpCountdown)}
      {item.fields && item.fields.length > 0 && (
        <>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Custom Fields" text="" />
          {item.fields.map((field, i) => (
            <Detail.Metadata.Label
              key={i}
              title={field.name}
              text={fieldDisplayText(field, revealedFields.has(i))}
            />
          ))}
        </>
      )}
      {item.attachments && item.attachments.length > 0 && (
        <>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Attachments" text="" />
          {item.attachments.map((att) => (
            <Detail.Metadata.Label key={att.id} title={att.fileName} text={att.sizeName} />
          ))}
        </>
      )}
    </Detail.Metadata>
  );
}

function renderTypeMetadata(
  item: BwItem,
  showPassword: boolean,
  totpCode?: string,
  totpCountdown?: number,
) {
  switch (item.type) {
    case ItemType.Login:
      return item.login ? (
        <LoginMetadata
          login={item.login}
          showPassword={showPassword}
          totpCode={totpCode}
          totpCountdown={totpCountdown ?? 0}
        />
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
  totpCountdown,
}: {
  login: NonNullable<BwItem['login']>;
  showPassword: boolean;
  totpCode?: string;
  totpCountdown: number;
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
      {login.totp && (
        <Detail.Metadata.Label
          title="TOTP"
          text={totpCode ? `${formatTotp(totpCode)}  ⏱ ${totpCountdown}s` : 'Loading...'}
        />
      )}
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
  const [totpCountdown, setTotpCountdown] = useState(30);
  const [showPassword, setShowPassword] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Set<number>>(new Set());
  const { pop, push } = useNavigation();

  useEffect(() => {
    if (!session) {
      setIsLoading(false);
      return;
    }
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

  useEffect(() => {
    const resolved = fullItem ?? item;
    if (resolved.type !== ItemType.Login || !resolved.login?.totp) return;

    const tick = () => {
      setTotpCountdown(30 - (Math.floor(Date.now() / 1000) % 30));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session, fullItem]);

  const resolved = fullItem ?? item;
  const markdown = buildItemDetailMarkdown(resolved);
  const actions = getItemActions(resolved);
  const resolvedFolderName = folderName ?? resolved.folderId ?? undefined;
  const metadata = buildMetadata(
    resolved,
    resolvedFolderName,
    showPassword,
    revealedFields,
    totpCode,
    totpCountdown,
  );

  return (
    <Detail
      markdown={isLoading ? 'Loading...' : markdown}
      navigationTitle={resolved.name}
      metadata={isLoading ? null : metadata}
      actions={
        isLoading ? (
          <ActionPanel>
            <Action title="Back" icon={Icon.ArrowLeft} onAction={pop} />
          </ActionPanel>
        ) : (
          <ActionPanel>
            <Action title="Back" icon={Icon.ArrowLeft} onAction={pop} />
            {renderItemActionElements(actions.slice(0, 2), onCopyTotp, item.id, session, true)}
            {resolved.type === ItemType.Login && resolved.login?.password && (
              <Action
                title={showPassword ? 'Hide Password' : 'Show Password'}
                icon={Icon.Eye}
                onAction={() => setShowPassword((prev) => !prev)}
              />
            )}
            {resolved.fields?.map((field, i) => {
              const elements: React.ReactNode[] = [];
              if (field.type === 1) {
                const revealed = revealedFields.has(i);
                elements.push(
                  <Action
                    key={`show-${i}`}
                    title={revealed ? `Hide ${field.name}` : `Show ${field.name}`}
                    icon={Icon.Eye}
                    onAction={() => {
                      setRevealedFields((prev) => {
                        const next = new Set(prev);
                        if (revealed) next.delete(i);
                        else next.add(i);
                        return next;
                      });
                    }}
                  />,
                );
              }
              elements.push(
                <Action.CopyToClipboard
                  key={`copy-${i}`}
                  title={`Copy ${field.name}`}
                  icon={Icon.CopyClipboard}
                  content={field.value}
                />,
              );
              return elements;
            })}
            {renderItemActionElements(actions.slice(2), onCopyTotp, item.id, session, true)}
            {session &&
              resolved.attachments?.map((att) => (
                <Action
                  key={`download-${att.id}`}
                  title={`Download ${att.fileName}`}
                  icon={Icon.SaveDocument}
                  onAction={async () => {
                    try {
                      const path = await bw.downloadAttachment(
                        att.id,
                        resolved.id,
                        att.fileName,
                        session,
                      );
                      await showToast({
                        style: Toast.Style.Success,
                        title: 'Downloaded',
                        message: att.fileName,
                      });
                      exec('xdg-open', [dirname(path)]).catch(() => {});
                    } catch (err) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'Download failed',
                        message: bw.getErrorMessage(err),
                      });
                    }
                  }}
                />
              ))}
            {session && (
              <Action
                title="Edit Item"
                icon={Icon.Pencil}
                onAction={() => {
                  push(
                    <EditItem
                      item={fullItem ?? item}
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
        )
      }
    />
  );
}
