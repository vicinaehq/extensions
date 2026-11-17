import { Action, ActionPanel, Icon, List, popToRoot } from "@vicinae/api";
import { useState } from "react";
import { DEFAULT_LOCK_POLICY, LOCK_POLICIES, type LockPolicy, type VaultGate } from "../lib/vault";

/**
 * Pushed from the account list. Lets the user change the lock policy and lock
 * the vault early.
 */
export function VaultSettings({ gate }: { gate: VaultGate }) {
  const [policy, setPolicy] = useState<LockPolicy>(gate.session?.policy ?? DEFAULT_LOCK_POLICY);

  async function choosePolicy(next: LockPolicy) {
    setPolicy(next);
    await gate.setPolicy(next);
  }

  async function lockNow() {
    await gate.lock();
    await popToRoot();
  }

  return (
    <List navigationTitle="Vault Settings">
      <List.Section title="Lock policy" subtitle="How long the unlocked key should keep working.">
        {LOCK_POLICIES.map((entry) => {
          const current = entry.value === policy;
          return (
            <List.Item
              key={entry.value}
              title={entry.title}
              subtitle={entry.description}
              icon={current ? Icon.CheckCircle : Icon.Circle}
              accessories={[
                ...(current ? [{ text: "Current" }] : []),
                ...(entry.recommended ? [{ text: "Recommended" }] : []),
              ]}
              actions={
                <ActionPanel>
                  {current ? null : (
                    <Action
                      title="Use This Policy"
                      icon={Icon.LockUnlocked}
                      onAction={() => {
                        void choosePolicy(entry.value as LockPolicy);
                      }}
                    />
                  )}
                  <Action title="Lock Now" icon={Icon.Lock} onAction={lockNow} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
      <List.Section title="Vault">
        <List.Item
          title="Lock Now"
          subtitle="Forget the cached key and require the master password again."
          icon={Icon.Lock}
          actions={
            <ActionPanel>
              <Action title="Lock Now" icon={Icon.Lock} onAction={lockNow} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
