# GOG - Google Workspace Extension

A Vicinae extension to manage Google Workspace services using the [gog CLI](https://gogcli.sh/).

## Features

- **Gmail** - Search threads, view messages, manage labels, compose/reply, drafts, attachments
- **Calendar** - View upcoming events, create events, switch calendars
- **Drive** - Browse files, filter by type, navigate folders, download
- **Docs** - List, view content, create, duplicate, export, trash
- **Sheets** - List, view data, create, duplicate, export, trash
- **Slides** - List, create, duplicate, export, trash
- **Tasks** - Manage task lists, create/edit/complete/delete tasks
- **Contacts** - Browse, search, create/edit/delete contacts

## Requirements

- [gog CLI](https://gogcli.sh/) installed and configured
- Google account authenticated via `gog auth`

## Setup

1. Install the gog CLI (see [gogcli.sh](https://gogcli.sh/) for instructions)
2. Authenticate: `gog auth login`
3. Install this extension via Vicinae

## Commands

### Gmail

- Search and browse email threads
- View message details with full content
- Create, edit, and delete drafts
- Compose new emails and reply to threads
- Add/remove labels, create custom labels
- Archive threads
- Download attachments
- Multi-account support

### Calendar

- View events for the next 30 days
- Create new events with title, date/time, and description
- Switch between multiple calendars
- Open events in browser
- Multi-account support

### Drive

- Browse files with type filters:
  - All, Recent, Starred, Shared with Me
  - Folders, Documents, Spreadsheets, Presentations
  - Images, PDFs, Videos
- Navigate folder hierarchy
- Download files
- View file metadata
- Multi-account support

### Docs

- List all Google Docs with filters (All, Starred, Shared, Trash)
- View document content as plain text
- Create new documents
- Duplicate existing documents
- Export to PDF, DOCX, or TXT
- Move to trash
- Multi-account support

### Sheets

- List all Google Sheets with filters
- View spreadsheet data as markdown table
- Copy data to clipboard
- Create new spreadsheets
- Duplicate existing spreadsheets
- Export to PDF, XLSX, or CSV
- Move to trash
- Multi-account support

### Slides

- List all Google Slides with filters
- Create new presentations
- Duplicate existing presentations
- Export to PDF or PPTX
- Move to trash
- Multi-account support

### Tasks

- View all task lists
- Create, edit, and delete tasks
- Mark tasks as complete/incomplete
- Set due dates and notes
- Multi-account support

### Contacts

- Browse contacts (My Contacts or Directory)
- Search contacts by name, email, or phone
- Create contacts with name, email, phone, organization, title
- Edit and delete contacts
- View detailed contact information
- Multi-account support

## License

MIT

## Author

knoopx
