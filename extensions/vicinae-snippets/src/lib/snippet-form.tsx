import { Action, ActionPanel, Detail, Form } from '@vicinae/api'
import { useMemo, useState } from 'react'

import { normalizeLineEndings } from './snippet-model'

export type SnippetFormValues = {
  title?: string
  category?: string
  keyword?: string
  content?: string
}

function toOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const s = value.trim()
  return s.length > 0 ? s : undefined
}

/**
 * Extension-side fallback: pad trailing blank lines at render-time to simulate a larger
 * "minimum visible height".
 *
 * - No Vicinae core changes required
 * - Still grows when content exceeds the minimum (TextArea defaults to growAsRequired=true)
 * - Reduce jitter by padding up to a fixed minimum: when line count <= MIN, height stays stable
 */
const CONTENT_MIN_VISIBLE_LINES = 14

const PLACEHOLDER_CHEATSHEET =
  'Placeholders are rendered when you Copy/Paste from “Search Snippets”. \nQuick reference: {date} {uuid} {argument}.\n\nMore: Actions → Placeholder Guide'

const PLACEHOLDER_GUIDE_MARKDOWN = [
  '# Dynamic Placeholders',
  '',
  '> Placeholders are rendered when you **Copy/Paste** from **Search Snippets**.',
  '> The editor shows the raw template.',
  '',
  '## Supported',
  '- `{clipboard}`: Clipboard text',
  '- `{selection}`: Selected text',
  '- `{uuid}`: UUID',
  '- Date & Time: `{date}` / `{time}` / `{datetime}` / `{day}`',
  '  - `format`: `{date format="yyyy-MM-dd"}` (Unicode TR35 patterns, Raycast-style)',
  '  - `offset`: `{date offset="+3M -5d"}` (m/h/d/M/y, case-sensitive)',
  '- `{argument}`: Prompts user input (max 3 distinct arguments)',
  '  - Reuse by name: `{argument name="tone"}`',
  '  - Default: `{argument name="tone" default="professional"}`',
  '  - Options: `{argument name="tone" options="happy, sad, professional"}`',
  '',
  '## Modifiers',
  '- Syntax: `{clipboard | trim | uppercase}` (chainable)',
  '- Supported: `raw` `trim` `uppercase` `lowercase` `percent-encode` `json-stringify`',
  '',
  '## Not Supported in Vicinae (will warn / be ignored)',
  '- `{cursor}`: Cursor positioning is not guaranteed (ignored)',
  '- `{snippet name="..."}`: Inserting other snippets is not supported',
  '- `{browser-tab ...}`: Reading browser tabs is not supported',
  '- `{clipboard offset=...}`: Clipboard history offset is not supported (falls back to latest clipboard)',
  '',
  '## Examples',
  '- `{clipboard}`',
  '- `{clipboard | trim | uppercase}`',
  '- `{date format="EEEE, MMM d, yyyy"}`',
  '- `{datetime format="yyyy-MM-dd\'T\'HH:mm:ssZ"}`',
  '- `{date format="yyyy-MM-dd" offset="+3M -5d"}`',
  '- `{argument name="name" default="World"}`'
].join('\n')

function countLines(text: string): number {
  // Even an empty string occupies 1 line in the editor.
  return text.split('\n').length
}

function paddingLinesFor(text: string): number {
  return Math.max(0, CONTENT_MIN_VISIBLE_LINES - countLines(text))
}

export function SnippetForm(props: {
  navigationTitle: string
  submitTitle: string
  initialValues?: SnippetFormValues
  onSubmit: (values: SnippetFormValues) => Promise<void>
  /**
   * Whether to show the Category field.
   * - Default: shown (consistent for Create/Edit)
   * - Hide by explicitly passing `false`
   */
  showCategory?: boolean
}) {
  const { navigationTitle, submitTitle, initialValues, onSubmit, showCategory = true } = props
  const [content, setContent] = useState<string>(initialValues?.content ?? '')
  const paddingLines = paddingLinesFor(content)
  const displayContent = useMemo(
    () => `${content}${'\n'.repeat(paddingLines)}`,
    [content, paddingLines]
  )

  return (
    <Form
      navigationTitle={navigationTitle}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={submitTitle}
            onSubmit={async (values: Form.Values) => {
              await onSubmit({
                title: typeof values.title === 'string' ? values.title : undefined,
                category: toOptionalTrimmedString(values.category),
                keyword: toOptionalTrimmedString(values.keyword),
                content
              })
            }}
          />
          <Action.Push
            title="Placeholder Guide"
            target={<Detail markdown={PLACEHOLDER_GUIDE_MARKDOWN} />}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Name" autoFocus defaultValue={initialValues?.title ?? ''} />
      <Form.TextArea
        id="content"
        title="Snippet"
        info={PLACEHOLDER_CHEATSHEET}
        value={displayContent}
        onChange={v => {
          if (paddingLines <= 0) {
            setContent(v)
            return
          }

          // We simulate a minimum visible height by padding extra trailing blank lines in the UI,
          // so we must strip those padded lines from the *actual* saved content.
          // `endsWith(expectedSuffix)` was unreliable in some editing scenarios and could leak
          // padding into snippet.content, producing lots of meaningless blank lines on Copy/Paste.
          const normalized = normalizeLineEndings(v)
          let out = normalized
          let removed = 0
          while (removed < paddingLines && out.endsWith('\n')) {
            out = out.slice(0, -1)
            removed += 1
          }
          setContent(out)
        }}
      />
      <Form.Description title="Placeholder Hints" text={PLACEHOLDER_CHEATSHEET} />
      <Form.TextField
        id="keyword"
        title="Keyword"
        info="Alias for Vicinae search only (no global auto-expansion)."
        defaultValue={initialValues?.keyword ?? ''}
      />
      {showCategory ? (
        <Form.TextField
          id="category"
          title="Category"
          defaultValue={initialValues?.category ?? ''}
        />
      ) : null}
    </Form>
  )
}
