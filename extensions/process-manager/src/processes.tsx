/**
 * Process Manager - Linux Kill Process
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  List,
  ActionPanel,
  Action,
  Icon,
  getPreferenceValues,
} from '@vicinae/api';
import { formatBytes } from './utils';
import { getProcessIcon } from './utils/processIcons';
import { useProcesses } from './hooks/useProcesses';
import { useProcessActions } from './hooks/useProcessActions';
import { useDebounce } from './hooks/useDebounce';
import type { PreferenceValues } from './types/preferences';
import type { Process } from './hooks/useProcesses';

export default function ProcessManager() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [processIcons, setProcessIcons] = useState<Map<string, string>>(new Map());
  const preferences = getPreferenceValues<PreferenceValues>();

  const { processes, isLoading, sortBy, setSortBy, refreshProcesses } = useProcesses();
  const { killProcess, buildSubtitle } = useProcessActions(refreshProcesses);

  // Stable dependency: only changes when set of process names changes
  const uniqueProcessNames = useMemo(
    () => [...new Set(processes.map(p => p.name))],
    [processes.map(p => p.name).sort().join(',')]
  );

  // Load icons once per unique process name
  useEffect(() => {
    async function loadIcons() {
      const newIcons = new Map(processIcons);

      for (const name of uniqueProcessNames) {
        if (!newIcons.has(name)) {
          newIcons.set(name, await getProcessIcon({ name } as Process));
        }
      }
      setProcessIcons(newIcons);
    }
    loadIcons();
  }, [uniqueProcessNames]);

  // Memoized filtering to prevent recalculation on every render
  const filtered = useMemo(() => {
    return processes.filter((process) => {
      if (!debouncedQuery) return true;

      const lowerQuery = debouncedQuery.toLowerCase();
      return (
        process.name.toLowerCase().includes(lowerQuery) ||
        (preferences['search-in-paths'] && process.command.toLowerCase().includes(lowerQuery)) ||
        (preferences['search-in-pid'] && process.pid.toString().includes(debouncedQuery))
      );
    });
  }, [processes, debouncedQuery, preferences['search-in-paths'], preferences['search-in-pid']]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Filter by name, PID, or path..."
      onSearchTextChange={setQuery}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Sort By"
          value={sortBy}
          onChange={(newValue) => setSortBy(newValue as 'cpu' | 'memory')}
        >
          <List.Dropdown.Section title="Sort By">
            <List.Dropdown.Item title="CPU Usage" value="cpu" />
            <List.Dropdown.Item title="Memory Usage" value="memory" />
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {(() => {
        if (filtered.length === 0 && !isLoading) {
          return (
            <List.EmptyView
              title="No processes found"
              description={debouncedQuery ? `No matches for "${debouncedQuery}"` : 'No processes running'}
              icon={Icon.MagnifyingGlass}
            />
          );
        }

        const totalCpu = filtered.reduce((sum, p) => sum + p.cpu, 0);
        const totalMem = filtered.reduce((sum, p) => sum + p.memRss, 0);
        const processLabel = filtered.length === 1 ? 'Process' : 'Processes';

        return (
          <List.Section
            title={`${filtered.length} ${processLabel} (CPU: ${totalCpu.toFixed(1)}% • RAM: ${formatBytes(totalMem * 1024)})`}
          >
            {filtered.map((process) => (
            <List.Item
              key={process.pid}
              id={`process-${process.pid}`}
              title={process.name}
              subtitle={buildSubtitle(process)}
              icon={processIcons.get(process.name) || Icon.Gear}
                accessories={[
                  {
                    text: `${process.cpu.toFixed(1)}%`,
                    icon: Icon.Gauge,
                  },
                  {
                    text: formatBytes(process.memRss * 1024),
                    icon: Icon.MemoryStick,
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Kill"
                      icon={Icon.XmarkCircle}
                      style={Action.Style.Destructive}
                      onAction={() => killProcess(process, false)}
                    />
                    <Action
                      title="Force Kill"
                      icon={Icon.XmarkCircle}
                      style={Action.Style.Destructive}
                      onAction={() => killProcess(process, true)}
                      shortcut={{ modifiers: ['cmd', 'shift'], key: 'k' }}
                    />
                    <Action.CopyToClipboard
                      title="Copy PID"
                      content={process.pid.toString()}
                      shortcut={{ modifiers: ['cmd'], key: 'c' }}
                    />
                    {process.command && (
                      <Action.CopyToClipboard
                        title="Copy Path"
                        content={process.command}
                        shortcut={{ modifiers: ['cmd', 'shift'], key: 'c' }}
                      />
                    )}
                    <Action
                      title="Reload"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ['cmd'], key: 'r' }}
                      onAction={refreshProcesses}
                    />
                </ActionPanel>
              }
            />
            ))}
          </List.Section>
        );
      })()}
    </List>
  );
}
