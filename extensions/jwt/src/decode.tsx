import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  type ColorLike,
  Form,
  Icon,
  Keyboard,
  LaunchProps,
  List,
  LocalStorage,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { annotate, orderedJson } from "./annotate.ts";
import { diffClaims, unifiedDiff } from "./diff.ts";
import { type Claims, type DecodedJwt, decodeJwt, tokenStatus } from "./jwt.ts";
import {
  discoveryUrl,
  isSymmetric,
  type Verification,
  verifyToken,
  verifyWithSecret,
} from "./verify.ts";

/** Only the claims are kept, never the signature: a stored signature would still be a usable credential. */
const PREVIOUS_KEY = "previous-claims";

type StoredClaims = { header: Claims; payload: Claims };

/** `null` until a check is asked for, `"checking"` while one is in flight. */
type VerificationState = Verification | "checking" | null;

type Tag = { value: string; color: ColorLike };

const TONE_COLOR = {
  valid: Color.Green,
  expired: Color.Red,
  pending: Color.Yellow,
  unknown: Color.SecondaryText,
} as const;

/**
 * Fixed colours rather than the theme's accents: a verdict must not read as green when
 * the active theme happens to define a reddish "green".
 */
const GREEN = { light: "#1a7f37", dark: "#3fb950" };
const RED = { light: "#cf222e", dark: "#f85149" };
const AMBER = { light: "#9a6700", dark: "#d29922" };

/**
 * Only `verified` and `invalid` are verdicts about the signature itself. Every other
 * outcome means the check could not be completed, which is not the same as a bad token.
 */
const VERIFICATION_TAG: Record<Verification["state"], Tag> = {
  verified: { value: "Successful", color: GREEN },
  invalid: { value: "Failed", color: RED },
  "unknown-key": { value: "Unknown", color: AMBER },
  unsupported: { value: "Unknown", color: AMBER },
  unavailable: { value: "Unknown", color: AMBER },
};

const UNVERIFIED: Tag = { value: "Unverified", color: Color.SecondaryText };
const CHECKING: Tag = { value: "Checking…", color: Color.SecondaryText };

/** Action panel order: ⏎ opens the first entry, the rest are one keypress further down. */
const SPECS = [
  { title: "RFC 7519: JSON Web Token", url: "https://www.rfc-editor.org/rfc/rfc7519" },
  { title: "RFC 7515: JSON Web Signature", url: "https://www.rfc-editor.org/rfc/rfc7515" },
  { title: "RFC 9068: JWT Access Tokens", url: "https://www.rfc-editor.org/rfc/rfc9068" },
  { title: "OpenID Connect Core", url: "https://openid.net/specs/openid-connect-core-1_0.html" },
] as const;

const pretty = orderedJson;

const commented = (claims: Claims) => `\`\`\`yaml\n${annotate(claims)}\n\`\`\``;

const rawValue = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

/** The finished verification, or `null` while none has been asked for or completed. */
const settled = (verification: VerificationState): Verification | null =>
  verification === null || verification === "checking" ? null : verification;

function verificationTag(verification: VerificationState): Tag {
  if (verification === null) return UNVERIFIED;
  if (verification === "checking") return CHECKING;
  return VERIFICATION_TAG[verification.state];
}

function SecretPrompt({
  alg,
  onVerify,
}: {
  alg: string;
  onVerify: (secret: string) => Promise<void>;
}) {
  const { pop } = useNavigation();

  return (
    <Form
      navigationTitle={`Verify ${alg}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Verify Signature"
            icon={Icon.Checkmark}
            shortcut={{ modifiers: [], key: "return" }}
            onSubmit={async (values) => {
              pop();
              await onVerify(String(values.secret ?? ""));
            }}
          />
        </ActionPanel>
      }
    >
      <Form.PasswordField id="secret" title="Shared secret" placeholder={`The ${alg} signing key`} />
      <Form.Description text="Tried as plain text and as base64url. Used for this check only, and never stored." />
    </Form>
  );
}

function SignatureDetail({
  signature,
  bytes,
  alg,
  issuer,
  verification,
}: {
  signature: string;
  bytes: number;
  alg: unknown;
  issuer: string | null;
  verification: VerificationState;
}) {
  const tag = verificationTag(verification);
  const result = settled(verification);

  return (
    <List.Item.Detail
      markdown={
        signature ? `\`\`\`\n${signature}\n\`\`\`` : "_Unsecured. This token has no signature._"
      }
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.TagList title="Signature">
            <List.Item.Detail.Metadata.TagList.Item text={tag.value} color={tag.color} />
          </List.Item.Detail.Metadata.TagList>
          {result && "reason" in result && (
            <List.Item.Detail.Metadata.Label title="Detail" text={result.reason} />
          )}
          {result?.state === "verified" && result.via && (
            <List.Item.Detail.Metadata.Label title="Secret read as" text={result.via} />
          )}
          {verification === null && (
            <List.Item.Detail.Metadata.Label
              title="Detail"
              text="Press ⏎ to check this signature against the issuer's published keys"
            />
          )}
          <List.Item.Detail.Metadata.Label title="Algorithm" text={rawValue(alg)} />
          <List.Item.Detail.Metadata.Label title="Length" text={`${bytes} bytes`} />
          {issuer && (
            <List.Item.Detail.Metadata.Link
              title="Discovery"
              target={discoveryUrl(issuer)}
              text={issuer}
            />
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export default function Command(props: LaunchProps<{ arguments: { token?: string } }>) {
  const { push } = useNavigation();
  const [decoded, setDecoded] = useState<DecodedJwt | null>(null);
  const [verification, setVerification] = useState<VerificationState>(null);
  const [previous, setPrevious] = useState<StoredClaims | null>(null);

  const decodeFromClipboard = useCallback(async () => {
    const result = decodeJwt((await Clipboard.readText()) ?? "");
    setDecoded(result);
    if (!result.ok) {
      await showToast({
        title: "Clipboard holds no JWT",
        message: result.error,
        style: Toast.Style.Failure,
      });
    }
  }, []);

  useEffect(() => {
    const argument = props.arguments.token?.trim();
    if (argument) setDecoded(decodeJwt(argument));
    else void decodeFromClipboard();
  }, [props.arguments.token, decodeFromClipboard]);

  useEffect(() => {
    if (!decoded?.ok) return;
    setVerification(null);

    let current = true;
    // The stored token is read before it is replaced, so the diff always compares against the one before.
    void LocalStorage.getItem<string>(PREVIOUS_KEY).then(async (stored) => {
      const remembered = stored ? (JSON.parse(stored) as StoredClaims) : null;
      if (current) setPrevious(remembered);
      if (JSON.stringify(remembered?.payload) !== JSON.stringify(decoded.payload)) {
        await LocalStorage.setItem(
          PREVIOUS_KEY,
          JSON.stringify({ header: decoded.header, payload: decoded.payload }),
        );
      }
    });

    return () => {
      current = false;
    };
  }, [decoded]);

  const verify = useCallback(async (token: string, header: Claims, payload: Claims) => {
    setVerification("checking");
    setVerification(await verifyToken(token, header, payload));
  }, []);

  const verifySecret = useCallback(async (token: string, secret: string) => {
    setVerification("checking");
    setVerification(await verifyWithSecret(token, secret));
  }, []);

  const reload = (
    <Action
      title="Decode from Clipboard"
      icon={Icon.CopyClipboard}
      shortcut={Keyboard.Shortcut.Common.Refresh}
      onAction={decodeFromClipboard}
    />
  );

  if (!decoded?.ok) {
    return (
      <List searchBarPlaceholder="Payload, header, signature">
        <List.EmptyView
          icon={Icon.QuestionMarkCircle}
          title={decoded ? "Not a JWT" : "Reading clipboard…"}
          description={decoded ? decoded.error : undefined}
          actions={<ActionPanel>{reload}</ActionPanel>}
        />
      </List>
    );
  }

  const { token, header, payload, signature } = decoded;
  const status = tokenStatus(payload);
  const signatureBytes = signature ? Buffer.from(signature, "base64url").length : 0;
  const issuer = typeof payload.iss === "string" ? payload.iss : null;
  const changes = previous ? diffClaims(previous.payload, payload) : null;
  const patch = previous ? unifiedDiff(pretty(previous.payload), pretty(payload)) : "";
  const tag = verificationTag(verification);

  const sectionActions = (title: string, content: string, primary?: React.ReactNode) => (
    <ActionPanel>
      {primary}
      <ActionPanel.Section title={title}>
        <Action.CopyToClipboard
          title={`Copy ${title}`}
          content={content}
          shortcut={Keyboard.Shortcut.Common.Copy}
        />
        <Action.Paste title={`Paste ${title}`} content={content} />
      </ActionPanel.Section>
      <ActionPanel.Section title="Token">
        <Action.CopyToClipboard
          title="Copy Authorization Header"
          icon={Icon.Key}
          content={`Authorization: Bearer ${token}`}
        />
        <Action.CopyToClipboard
          title="Copy as Curl"
          icon={Icon.Terminal}
          content={`curl -H 'Authorization: Bearer ${token}' '<url>'`}
        />
        <Action.CopyToClipboard
          title="Copy All"
          content={JSON.stringify({ header, payload, signature }, null, 2)}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        {issuer && (
          <Action.OpenInBrowser
            title="Open Issuer Discovery Document"
            icon={Icon.Globe01}
            url={discoveryUrl(issuer)}
          />
        )}
        <Action
          title="Forget Previous Token"
          icon={Icon.Trash}
          style="destructive"
          onAction={async () => {
            await LocalStorage.removeItem(PREVIOUS_KEY);
            setPrevious(null);
            await showToast({ title: "Forgot the previous token" });
          }}
        />
        {reload}
      </ActionPanel.Section>
    </ActionPanel>
  );

  const verifySignature = () => {
    // A symmetric token has no published key, so it needs the secret first.
    if (isSymmetric(header.alg)) {
      push(
        <SecretPrompt alg={String(header.alg)} onVerify={(secret) => verifySecret(token, secret)} />,
      );
    } else {
      void verify(token, header, payload);
    }
  };

  return (
    <List isShowingDetail searchBarPlaceholder="Payload, header, signature, diff">
      <List.Item
        title="Payload"
        subtitle={`${Object.keys(payload).length} claims`}
        icon={Icon.Person}
        accessories={[{ tag: { value: status.label, color: TONE_COLOR[status.tone] } }]}
        actions={sectionActions("Payload", pretty(payload))}
        detail={<List.Item.Detail markdown={commented(payload)} />}
      />
      <List.Item
        title="Header"
        subtitle={rawValue(header.alg)}
        icon={Icon.Cog}
        actions={sectionActions("Header", pretty(header))}
        detail={<List.Item.Detail markdown={commented(header)} />}
      />
      <List.Item
        title="Signature"
        subtitle={signature ? `${signatureBytes} bytes` : "Unsigned"}
        icon={{ source: Icon.Key, tintColor: tag.color }}
        accessories={[{ tag }]}
        actions={sectionActions(
          "Signature",
          signature,
          <Action title="Verify Signature" icon={Icon.Checkmark} onAction={verifySignature} />,
        )}
        detail={
          <SignatureDetail
            signature={signature}
            bytes={signatureBytes}
            alg={header.alg}
            issuer={issuer}
            verification={verification}
          />
        }
      />
      {changes && (
        <List.Item
          title="Diff"
          subtitle={changes.length ? `${changes.length} changed` : "identical"}
          icon={Icon.ArrowRight}
          actions={sectionActions("Diff", patch)}
          detail={
            <List.Item.Detail
              markdown={
                patch
                  ? `\`\`\`diff\n${patch}\n\`\`\``
                  : "_No claims changed since the previous token._"
              }
            />
          }
        />
      )}
      <List.Item
        title="Specs"
        subtitle="RFC 7519"
        icon={Icon.Book}
        actions={
          <ActionPanel>
            {SPECS.map((spec) => (
              <Action.OpenInBrowser
                key={spec.url}
                title={spec.title}
                icon={Icon.Book}
                url={spec.url}
              />
            ))}
            {reload}
          </ActionPanel>
        }
        detail={
          <List.Item.Detail
            markdown={SPECS.map((spec) => `- [${spec.title}](${spec.url})`).join("\n")}
          />
        }
      />
    </List>
  );
}
