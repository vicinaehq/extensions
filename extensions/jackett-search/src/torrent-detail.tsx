import React, { useMemo } from 'react';
import {
  Detail,
  ActionPanel,
  Action,
  Icon,
  Color,
  showToast,
  Toast,
  useNavigation,
} from '@vicinae/api';
import { JackettTorrent } from './types/torrent';
import { formatBytes, formatDate, generateTorrentMarkdown } from './utils/jackett';

interface TorrentDetailProps {
  torrent: JackettTorrent;
}

export default function TorrentDetail({ torrent }: TorrentDetailProps) {
  const { pop } = useNavigation();

  const markdown = useMemo(() => generateTorrentMarkdown(torrent), [torrent]);

  const openMagnetLink = async () => {
    if (!torrent.MagnetUri) return;

    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      await execAsync(`xdg-open "${torrent.MagnetUri}"`);
      showToast({
        title: 'Opening torrent...',
        style: Toast.Style.Success,
      });
    } catch (err) {
      showToast({
        title: 'Failed to open magnet link',
        style: Toast.Style.Failure,
      });
    }
  };

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Seeders"
            text={`${torrent.Seeders}`}
            icon={{
              source: Icon.ArrowUp,
              tintColor: torrent.Seeders > 10 ? Color.Green : Color.Orange,
            }}
          />
          <Detail.Metadata.Label
            title="Peers"
            text={`${torrent.Peers}`}
            icon={{
              source: Icon.ArrowDown,
            }}
          />
          <Detail.Metadata.Label
            title="Size"
            text={formatBytes(torrent.Size)}
            icon={{
              source: Icon.HardDrive,
            }}
          />
          <Detail.Metadata.Label
            title="Tracker"
            text={torrent.Tracker || torrent.TrackerId}
            icon={{
              source: Icon.Globe,
            }}
          />
          <Detail.Metadata.Label
            title="Category"
            text={torrent.CategoryDesc || 'Unknown'}
          />
          <Detail.Metadata.Label
            title="Published"
            text={formatDate(torrent.PublishDate)}
            icon={{
              source: Icon.Calendar,
            }}
          />
          {torrent.MagnetUri && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label
                title="Magnet"
                text="Available"
                icon={{
                  source: Icon.ArrowUpCircle,
                  tintColor: Color.Green,
                }}
              />
            </>
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {torrent.MagnetUri && (
            <>
              <Action
                title="Open Magnet Link"
                icon={Icon.ArrowUpCircle}
                onAction={openMagnetLink}
              />
              <Action.CopyToClipboard
                title="Copy Magnet Link"
                icon={Icon.Clipboard}
                content={torrent.MagnetUri}
                shortcut={{ modifiers: ['cmd'], key: 'c' }}
              />
            </>
          )}
          {torrent.Link && (
            <Action.OpenInBrowser
              title="Download Torrent File"
              icon={Icon.Download}
              url={torrent.Link}
            />
          )}
          {torrent.Details && (
            <Action.OpenInBrowser
              title="Open in Browser"
              icon={Icon.Globe}
              url={torrent.Details}
            />
          )}
          <ActionPanel.Section>
            <Action
              title="Go Back"
              icon={Icon.ArrowLeft}
              onAction={pop}
              shortcut={{ modifiers: ['cmd'], key: '[' }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
