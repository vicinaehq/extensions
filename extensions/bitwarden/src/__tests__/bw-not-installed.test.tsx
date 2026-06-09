import { describe, expect, it, vi } from 'vitest';

vi.mock('@vicinae/api', () => ({
  Action: {
    OpenInBrowser: vi.fn(({ title, url }: { title: string; url: string }) => null),
    SubmitForm: vi.fn(() => null),
    Style: { Destructive: 'destructive' },
  },
  ActionPanel: vi.fn(({ children }: { children: React.ReactNode }) => children),
  Detail: vi.fn(({ markdown }: { markdown: string }) => markdown),
  Icon: {},
}));

import React from 'react';
import { render } from '@testing-library/react';
import { BwNotInstalled } from '../bw-not-installed';

describe('BwNotInstalled', () => {
  it('renders install guide markdown', () => {
    const { container } = render(React.createElement(BwNotInstalled));
    expect(container.textContent).toContain('Bitwarden CLI Not Found');
    expect(container.textContent).toContain('bitwarden.com/download');
  });
});
