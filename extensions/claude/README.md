# Claude Chat Extension for Vicinae

Chat with Claude AI directly from Vicinae launcher. Ask questions, get help with coding, writing, analysis, and more - all without leaving your workflow.

> **Note:** This is an early example of a chat integration built with Vicinae extensions. It demonstrates how to build conversational AI experiences using Vicinae's native architecture.

## Features

- 🤖 **AI-Powered Assistance**: Chat with Claude AI (Anthropic's powerful language model)
- 💬 **Persistent Chat History**: All conversations automatically saved using Vicinae's Cache API
- 🔄 **Multiple Models**: Choose between Claude 4.5 Sonnet, Haiku, or Opus
- 📋 **Copy Messages**: Easily copy individual messages or entire conversations
- ⚡ **Fast & Native**: Built with Vicinae's native architecture - no browser or Electron overhead
- 🔒 **Secure**: Your API key is stored securely in Vicinae preferences
- 📝 **AI-Generated Titles**: Chat titles automatically created by Claude based on conversation context
- 🎯 **Two Commands**: Separate commands for starting new chats and browsing history
- 🌊 **Streaming Support**: Real-time response streaming
- 🗑️ **Chat Management**: Delete old conversations to keep your history organized

## Prerequisites

Before using this extension, you need an Anthropic API key:

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (it starts with `sk-ant-...`)

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

1. Open Vicinae launcher
2. Find the Claude extension
3. Open extension preferences (or settings)
4. Paste your Anthropic API key in the "API Key" field
5. (Optional) Select your preferred Claude model
6. (Optional) Adjust max tokens for responses

### 3. Run in Development Mode

```bash
npm run dev
```

### 4. Build for Production

```bash
npm run build
```

## Usage

The extension provides two commands:

### New Chat with Claude
1. Open Vicinae and search for "New Chat with Claude" or just "claude"
2. The command immediately opens a fresh chat interface
3. Type your message in the search bar at the top
4. Press **Enter** or **Shift+Enter** to send your message
5. Claude's response appears in real-time in the conversation list
6. Continue the conversation by typing and sending more messages

### Claude Chat History
1. Open Vicinae and search for "Claude Chat History"
2. Browse all your saved conversations
3. Click on any chat to open and continue it
4. Delete old conversations using `Cmd+X`

## Configuration

The extension supports the following preferences:

- **API Key** (required): Your Anthropic API key
- **Model** (optional): Choose your preferred Claude model
  - Claude 4.5 Sonnet (Latest) - Best balance of speed and capability
  - Claude 4.5 Haiku - Fastest responses (default)
  - Claude 4.5 Opus - Most powerful, highest capability
- **Max Tokens** (optional): Maximum response length (default: 4096)
- **Enable Streaming** (optional, experimental): Stream responses in real-time as they arrive. Warning: This is experimental and may cause UI flickering. Disabled by default for a stable experience.

## Features in Detail

### Conversation Management
- Full conversation history with timestamps
- Persistent chat across sessions
- Clear chat functionality to start fresh

### Message Actions
- Copy individual messages
- Copy entire conversation
- View message timestamps

### Error Handling
- Graceful error messages if API key is missing
- Network error handling
- API error reporting

## Troubleshooting

**Extension won't load?**
- Make sure you've run `npm install`
- Check that your API key is correctly set in preferences

**Getting API errors?**
- Verify your API key is valid and active
- Check your Anthropic account has sufficient credits
- Ensure you have internet connectivity

**Messages not appearing?**
- Check the console for errors
- Verify the selected model is available for your API key
- Try reducing max tokens if hitting limits

## Development

To modify or extend this extension:

1. Edit the source files:
   - `src/new-chat.tsx` - New chat command entry point
   - `src/chat-list.tsx` - Chat history command entry point
   - `src/components/ChatView.tsx` - Main chat interface component
   - `src/hooks/useChat.ts` - Chat state management hook
   - `src/services/claudeService.ts` - Claude API integration
   - `src/services/chatStorage.ts` - Persistent storage using Cache API
2. Update `package.json` for manifest changes
3. Run `npm run dev` to test changes in development mode
4. Run `npm run lint` to check code quality
5. Run `npm run format` to format code with Biome
6. Run `npm run build` to build for production

## License

MIT

## Author

dfseifert
