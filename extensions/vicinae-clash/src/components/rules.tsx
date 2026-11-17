import { Action, ActionPanel, Alert, Color, confirmAlert, Detail, Icon, List, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { getRuleProviderCounts, getRules, setRuleDisabled } from "../lib/clash-api";
import { showError } from "../lib/toast";
import type { Rule } from "../types";

function ruleDetails(rule: Rule): string {
  return `\`\`\`json\n${JSON.stringify(rule, null, 2)}\n\`\`\``;
}

export default function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [providerCounts, setProviderCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextRules, nextProviderCounts] = await Promise.all([getRules(), getRuleProviderCounts()]);
      setRules(nextRules);
      setProviderCounts(nextProviderCounts);
    } catch (error) {
      await showError("Could Not Load Rules", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function toggleRule(rule: Rule) {
    const disabled = !rule.extra?.disabled;
    if (
      disabled &&
      !(await confirmAlert({
        title: "Disable this rule temporarily?",
        message: "This affects routing immediately and resets after mihomo restarts.",
        primaryAction: { title: "Disable Rule", style: Alert.ActionStyle.Destructive },
      }))
    )
      return;

    setIsLoading(true);
    try {
      await setRuleDisabled(rule.index, disabled);
      await load();
      await showToast({
        style: Toast.Style.Success,
        title: disabled ? "Rule Disabled" : "Rule Enabled",
        message: rule.payload || rule.type,
      });
    } catch (error) {
      await showError(disabled ? "Could Not Disable Rule" : "Could Not Enable Rule", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search all rules...">
      {rules.map((rule, index) => {
        const title = rule.payload || rule.type;
        const entryCount =
          rule.size >= 0 ? rule.size : rule.type === "RuleSet" ? providerCounts[rule.payload] : undefined;
        return (
          <List.Item
            key={`${rule.type}-${rule.payload}-${index}`}
            icon={{ source: Icon.Shield01, tintColor: rule.extra?.disabled ? Color.Red : undefined }}
            title={title}
            subtitle={[
              rule.payload ? rule.type : undefined,
              entryCount !== undefined ? `${entryCount} ${entryCount === 1 ? "entry" : "entries"}` : undefined,
              rule.extra ? `${rule.extra.hitCount} ${rule.extra.hitCount === 1 ? "hit" : "hits"}` : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
            keywords={[rule.type, rule.proxy, rule.payload, String(rule.index)]}
            accessories={[
              { tag: rule.proxy },
              ...(rule.extra
                ? [
                    {
                      icon: Icon.Switch,
                      tag: rule.extra.disabled
                        ? { value: "Off", color: Color.SecondaryText }
                        : { value: "On", color: Color.Green },
                      tooltip: rule.extra.disabled ? "Rule disabled" : "Rule enabled",
                    },
                  ]
                : []),
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Show Rule Details"
                  icon={Icon.Eye}
                  target={<Detail markdown={ruleDetails(rule)} />}
                />
                {rule.extra ? (
                  <Action
                    title={rule.extra.disabled ? "Enable Rule" : "Disable Rule"}
                    icon={rule.extra.disabled ? Icon.CheckCircle : Icon.CircleDisabled}
                    style={rule.extra.disabled ? undefined : Action.Style.Destructive}
                    onAction={() => void toggleRule(rule)}
                  />
                ) : null}
                <Action.CopyToClipboard
                  title="Copy Rule"
                  icon={Icon.CopyClipboard}
                  content={[rule.type, rule.payload, rule.proxy].filter(Boolean).join(",")}
                />
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => void load()} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
