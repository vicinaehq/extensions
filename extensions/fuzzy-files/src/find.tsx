import { useState } from 'react'
import { Action, ActionPanel, Application, Detail, Icon, List, getDefaultApplication } from '@vicinae/api'
import { lstatSync, readFileSync, Stats } from 'fs'
import { spawn } from 'child_process'
import { getMimeTypeSync } from './script/file'
import { platform } from 'process'

let fileBrowser: Application
getDefaultApplication('inode/directory').then(v => fileBrowser = v)

interface File {
  id: number
  path: string
  name: string
  mime: string
  info: Stats
}

const MIME = (mime: string): keyof typeof Icon => {
  if (!mime) return 'Document'
  if (mime.includes('image')) return 'Image'
  if (mime.includes('directory')) return 'Folder'
  if (mime.includes('video')) return 'FilmStrip'
  if (mime.includes('audio')) return 'Music'
  if (mime.includes('application')) return 'Code'
  if (mime.includes('html')) return 'Code'
  if (mime.includes('text')) return 'Text'
  return 'Document'
}

let depsInstalled = true
function Finder() {
  const process = spawn('gf', {
    stdio: ['pipe', 'pipe', 'ignore']
  })
  process.on('error', (e: Error) => {
    if (e.message === 'spawn gf ENOENT') depsInstalled = false
  })

  if (!process.stdin || !process.stdout) {
    throw new Error('Failed to create pipes')
  }

  const writer = process.stdin
  const reader = process.stdout
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const exit = () => writer.write(encoder.encode(`c:Exit`))

  const search = async (query: string) => new Promise<File[]>((resolve, reject) => {
    writer.write(encoder.encode(`q:${query}\n`))

    const onData = (res: Uint8Array) => {
      reader.off('data', onData)

      const [_, ...lines] = decoder.decode(res).split('\n').filter(line => line.trim())
      return Promise.all(lines
        .map(async (path, id) => {
          const name = path.split('/').pop() || path
          const mime = getMimeTypeSync(path)
          return { id, path, name, mime, data: null, info: lstatSync(path) }
        })).then(resolve).catch(reject)
    }
    reader.once('data', onData)
  })

  return { search, exit }
}

const readData = (file: File) => {
  let data
  if (file.mime?.startsWith('image')) {
    data = readFileSync(file.path)
  } else if (file.mime?.startsWith('text')) {
    data = readFileSync(file.path, 'utf8')
  }
  return data
}


const finder = Finder()
export default function ListDetail(): JSX.Element {
  const [results, setResults] = useState<File[]>([])
  const [searchText, setSearchText] = useState<string>('')
  if (!depsInstalled) {
    return (
      <Detail navigationTitle='Files' markdown={`
    Error: Required dependency \`goldfish\` is not available\n
Build or download a copy from [https://github.com/sameoldlab/goldfish](https://github.com/sameoldlab/goldfish).
        `}

        actions={<ActionPanel>
          <Action.OpenInBrowser shortcut={'open'} title='Open Link' url={'https://github.com/sameoldlab/goldfish'} />
        </ActionPanel>}
      />
    )
  }

  return (
    <List
      isShowingDetail
      searchText={searchText}
      onSearchTextChange={query => {
        setSearchText(query)
        finder.search(query).then(setResults)
      }}
      searchBarPlaceholder={'Search files'}
    >
      <List.Section title={'Files'}>
        {results.map(file => (
          <List.Item
            key={file.id}
            title={file.name}
            icon={Icon[MIME(file.mime ?? '')]}
            detail={
              <List.Item.Detail
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title='Name' text={file.name} />
                    <List.Item.Detail.Metadata.Label title='Path' text={file.path} />
                    {file.mime != 'inode/directory' && <>
                      <List.Item.Detail.Metadata.Label title='Type' text={file.mime || 'Unknown'} />
                      <List.Item.Detail.Metadata.Label title='Size' text={fmtSize(file.info.size ?? 0)} />
                    </>}
                    <List.Item.Detail.Metadata.Label title='Modified' text={file.info.mtime.toLocaleString() || 'Unknown'} />
                    <List.Item.Detail.Metadata.Label title='Created' text={file.info.birthtime.toLocaleString() || 'Unknown'} />
                    <List.Item.Detail.Metadata.Label title='Permissions' text={fmtPerms(file.info.mode)} />
                  </List.Item.Detail.Metadata>
                }
                markdown={file.mime?.startsWith('text') ? readFileSync(file.path, 'utf8') : undefined}
              />
            }
            actions={
              <ActionPanel>
                <Action.Open shortcut={'open'} title='Open' target={file.path} />
                {file.mime?.startsWith('text') && <Action.CopyToClipboard
                  title='Copy File'
                  shortcut={'pin'}
                  content={readData(file) as string}
                />}
                <Action.CopyToClipboard shortcut={'copy-path'} title='Copy Path' content={file.path} />
                <Action
                  title='Search from directory'
                  shortcut={'save'}
                  icon={Icon['ArrowRightCircleFilled']}
                  onAction={() => {
                    let path = file.path
                    if (file.mime !== 'inode/directory') {
                      const startOfFileName = path.lastIndexOf(platform === 'win32' ? '\\' : '/')
                      path = path.slice(0, startOfFileName + 1)
                    }
                    setSearchText(path)
                  }}
                />
                <Action.Open
                  title={`Reveal in ${fileBrowser.name}`}
                  shortcut={'open-with'}
                  icon={fileBrowser.icon}
                  target={file.path}
                  app={fileBrowser}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  )
}

function fmtSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function fmtPerms(mode: number | null): string {
  if (mode === null) return 'Unknown'

  const owner = (mode >> 6) & 7
  const group = (mode >> 3) & 7
  const other = mode & 7

  const fmtTriad = (n: number) => {
    return ((n & 4) ? 'r' : '-') +
      ((n & 2) ? 'w' : '-') +
      ((n & 1) ? 'x' : '-')
  }

  return fmtTriad(owner) + fmtTriad(group) + fmtTriad(other)
}
