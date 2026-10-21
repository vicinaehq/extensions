import { Action, ActionPanel, Form, Icon } from "@vicinae/api";
import { useRef, useState } from "react";
import {
  DEFAULT_LOCK_POLICY,
  LOCK_POLICIES,
  type LockPolicy,
  type UnlockResult,
} from "../lib/vault";

/** Icons for the policy dropdown. Only used on the onboarding form. */
const POLICY_ICONS = {
  "every-time": Icon.Lock,
  "on-logout": Icon.Logout,
  "on-reboot": Icon.Power,
  never: Icon.LockDisabled,
} as const;

/** Shown under the dropdown when the riskiest policy is selected. */
const NEVER_WARNING =
  "Security risk: the key is never forgotten, so anything that can read vicinae.db can generate your codes. Lock by hand, or change your Keysmith password, to clear it.";

type UnlockFormProps = {
  /** First run asks for the lock policy as well as the password. */
  firstRun: boolean;
  onSubmit: (password: string, policy: LockPolicy) => Promise<UnlockResult>;
};

export function UnlockForm({ firstRun, onSubmit }: UnlockFormProps) {
  const [password, setPassword] = useState("");
  const [policy, setPolicy] = useState<LockPolicy>(DEFAULT_LOCK_POLICY);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<Form.PasswordField>(null);

  async function handleSubmit() {
    if (!password) {
      setError("Enter your Keysmith master password.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await onSubmit(password, policy);
      if (!result.ok) {
        // Keep the form mounted so the user can retry with the right password.
        setError(result.message);
        setPassword("");
        passwordRef.current?.reset();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPolicy = LOCK_POLICIES.find((entry) => entry.value === policy);

  return (
    <Form
      isLoading={submitting}
      navigationTitle={firstRun ? "Unlock Keysmith" : "Keysmith locked"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={firstRun ? "Unlock and Continue" : "Unlock"}
            icon={Icon.LockUnlocked}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title={firstRun ? "Welcome to Keysmith" : "Vault locked"}
        text={
          firstRun
            ? "Enter the master password you use in Keysmith. The password itself is never stored, but a key derived from it can be cached according to the policy below."
            : "Enter your Keysmith master password to unlock the vault."
        }
      />
      <Form.PasswordField
        id="password"
        title="Master password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          if (error) setError(undefined);
        }}
        error={error}
        autoFocus
        ref={passwordRef}
      />
      {firstRun ? (
        <Form.Dropdown
          id="lockPolicy"
          title="Lock policy"
          value={policy}
          info="How long the derived key keeps working after you unlock. Your master password is never stored either way."
          onChange={(next) => setPolicy(next as LockPolicy)}
        >
          {LOCK_POLICIES.map((entry) => (
            <Form.Dropdown.Item
              key={entry.value}
              value={entry.value}
              title={entry.recommended ? `${entry.title} (Recommended)` : entry.title}
              icon={POLICY_ICONS[entry.value]}
            />
          ))}
        </Form.Dropdown>
      ) : null}
      {firstRun && selectedPolicy ? <Form.Description text={selectedPolicy.description} /> : null}
      {firstRun && policy === "never" ? <Form.Description text={NEVER_WARNING} /> : null}
    </Form>
  );
}
