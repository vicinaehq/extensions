import { List } from "@vicinae/api";
import React from "react";

import { LiveResetLabel, useResetCountdown } from "./countdown.tsx";
import { isCompactLimitList, limitItemText, limitResetText } from "./detail-format.ts";
import type { LimitItem } from "./detail-format.ts";

function SubRows({ rows }: { rows: NonNullable<LimitItem["subRows"]> }) {
  return (
    <>
      {rows.map((row, index) => (
        <List.Item.Detail.Metadata.Label key={`${row.title}-${index}`} title={row.title} text={row.text} />
      ))}
    </>
  );
}

/**
 * Compact limit row: a single metadata line carrying bar, percent, absolute
 * values and a live "resets" countdown — no separator, no second row.
 */
function CompactLimitLabel({ item }: { item: LimitItem }) {
  const remaining = useResetCountdown(item.resetsInSeconds);
  const reset = limitResetText(item, remaining);
  const text = reset ? `${limitItemText(item)} · resets ${reset}` : limitItemText(item);
  return <List.Item.Detail.Metadata.Label title={item.title} text={text} />;
}

/**
 * The standard limit layout shared by every provider.
 *
 * Up to COMPACT_LIMIT_THRESHOLD windows render the roomy layout — a labeled
 * bar row plus a live "Resets In" row per window, separated. Beyond that the
 * list switches to compact mode: one row per window with the countdown
 * inline, so providers with many pools (e.g. Antigravity via omp) don't
 * repeat the same two-row block over and over.
 */
export function LimitItems({ items }: { items: LimitItem[] }) {
  if (items.length === 0) return null;

  if (isCompactLimitList(items)) {
    return (
      <>
        <List.Item.Detail.Metadata.Separator />
        {items.map((item) => (
          <React.Fragment key={item.id}>
            <CompactLimitLabel item={item} />
            {item.subRows && <SubRows rows={item.subRows} />}
          </React.Fragment>
        ))}
      </>
    );
  }

  return (
    <>
      {items.map((item) => (
        <React.Fragment key={item.id}>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title={item.title} text={limitItemText(item)} />
          {item.resetsInSeconds != null ? (
            <LiveResetLabel seconds={item.resetsInSeconds} />
          ) : item.resetsText ? (
            <List.Item.Detail.Metadata.Label title="Resets In" text={item.resetsText} />
          ) : null}
          {item.subRows && <SubRows rows={item.subRows} />}
        </React.Fragment>
      ))}
    </>
  );
}
