import { vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@vicinae/api', () => {
  const ListSection = ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div data-testid="list-section">
      {title && <div data-testid="section-title">{title}</div>}
      {children}
    </div>
  );
  
  const ListItem = ({ title, subtitle, icon, actions, accessories }: {
    title: string;
    subtitle?: string;
    icon?: string;
    actions?: React.ReactNode;
    accessories?: Array<{ text?: { value: string; color?: string } | string; icon?: string }>;
  }) => (
    <div data-testid="list-item" data-icon={icon}>
      <div data-testid="item-title">{title}</div>
      {subtitle && <div data-testid="item-subtitle">{subtitle}</div>}
      {accessories && accessories.length > 0 && (
        <div data-testid="item-accessories">
          {accessories.map((acc, i) => {
            let textValue = '';
            if (acc.text) {
              textValue = typeof acc.text === 'string' ? acc.text : acc.text.value || '';
            }
            return (
              <span key={i} data-testid="accessory">
                {textValue}
              </span>
            );
          })}
        </div>
      )}
      {actions && <div data-testid="item-actions">{actions}</div>}
    </div>
  );
  
  const List = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="list">
      {children}
    </div>
  );
  List.Section = ListSection;
  List.Item = ListItem;
  
  const Detail = ({ markdown, actions }: { markdown: string; actions?: React.ReactNode }) => (
    <div data-testid="detail">
      {markdown}
      {actions && <div data-testid="detail-actions">{actions}</div>}
    </div>
  );
  const Form = ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <form data-testid="form">
      {children}
      {actions && <div data-testid="form-actions">{actions}</div>}
    </form>
  );
  Form.TextField = ({ id, title, defaultValue }: { id: string; title?: string; defaultValue?: string }) => (
    <div data-testid="textfield">
      {title && <label data-testid="textfield-label">{title}</label>}
      <input type="text" data-testid="textfield-input" id={id} defaultValue={defaultValue} />
    </div>
  );
  const Action = ({ title, style }: { title: string; style?: string }) => (
    <button type="button" data-testid="action" data-style={style}>{title}</button>
  );
  Action.Style = { Destructive: 'destructive' as const };
  Action.SubmitForm = ({ title }: { title: string }) => <button type="submit" data-testid="submit-action">{title}</button>;
  const ActionPanel = ({ children }: { children: React.ReactNode }) => <div data-testid="action-panel">{children}</div>;
  ActionPanel.Section = ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div data-testid="action-panel-section">{children}</div>
  );
  
  return {
    closeMainWindow: vi.fn(),
    showToast: vi.fn(),
    open: vi.fn(),
    environment: { sudo: false },
    List,
    Detail,
    Form,
    Action,
    ActionPanel,
    Icon: {
      CheckCircle: 'check-circle',
      Warning: 'warning',
      Document: 'document',
      Pencil: 'pencil',
      Clock: 'clock',
      ArrowUp: 'arrow-up',
      Gear: 'gear',
      Clipboard: 'clipboard',
      Folder: 'folder',
      Dot: 'dot',
      Trash: 'trash',
      Refresh: 'refresh',
      Book: 'book',
      Branch: 'branch',
      Cloud: 'cloud',
      Command: 'command',
      Cross: 'cross',
      DocumentText: 'document-text',
      Download: 'download',
      Edit: 'edit',
      Envelope: 'envelope',
      Eye: 'eye',
      Globe: 'globe',
      Graph: 'graph',
      Image: 'image',
      Link: 'link',
      Lock: 'lock',
      MagLeft: 'mag-left',
      Music: 'music',
      Play: 'play',
      Plus: 'plus',
      Search: 'search',
      Share: 'share',
      Sidebar: 'sidebar',
      Star: 'star',
      Tag: 'tag',
      Terminal: 'terminal',
      Text: 'text',
      ThreeBars: 'three-bars',
      Unlocked: 'unlocked',
      Upload: 'upload',
      Video: 'video',
      Wrench: 'wrench',
    },
    Color: {
      Primary: '#007AFF',
      Secondary: '#5856D6',
      Tertiary: '#AF52DE',
      Quaternary: '#FF2D55',
      Orange: '#FF9500',
      Yellow: '#FFCC00',
      Green: '#34C759',
      Red: '#FF3B30',
      Blue: '#007AFF',
      Purple: '#AF52DE',
      Pink: '#FF2D55',
      Gray: '#8E8E93',
      Grey: '#8E8E93',
    },
    LaunchType: {
      UserInitiated: 'user-initiated' as const,
      Background: 'background' as const,
      URLScheme: 'url-scheme' as const,
      Doc: 'doc' as const,
    },
    useNavigation: () => ({
      push: vi.fn(),
      pop: vi.fn(),
      replace: vi.fn(),
    }),
    useForm: vi.fn(),
    Clipboard: {
      copy: vi.fn(),
      paste: vi.fn(),
    },
    showHUD: vi.fn(),
    showFailureToast: vi.fn(),
  };
});

vi.mock('./utils/exec', () => ({
  execJJ: vi.fn(),
}));

vi.mock('./utils/helpers', () => ({
  getErrorMessage: vi.fn((e) => e instanceof Error ? e.message : 'Unknown error'),
  withErrorHandling: vi.fn((fn) => fn),
  SHORTCUTS: {
    VIEW_STATUS: { modifiers: ["ctrl"], key: "s" as const },
    VIEW_LOG: { modifiers: ["ctrl"], key: "l" as const },
  },
}));

vi.mock('./utils/change', () => ({
  createNewChange: vi.fn(),
  describeChange: vi.fn(),
  getCurrentDescription: vi.fn(() => ""),
}));

vi.mock('./utils/log', () => ({
  getJJLog: vi.fn(() => []),
}));

vi.mock('child_process', () => {
  const execSync = vi.fn();
  const exec = vi.fn();
  const spawn = vi.fn();
  return {
    execSync,
    exec,
    spawn,
    default: { execSync, exec, spawn },
  };
});

vi.mock('os', () => ({
  homedir: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
  resolve: vi.fn((...args) => args.join('/')),
  basename: vi.fn((p) => p.split('/').pop()),
  dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
}));

vi.mock('process', () => ({
  cwd: vi.fn(() => '/home/test/project'),
  env: {
    HOME: '/home/test',
  },
}));
