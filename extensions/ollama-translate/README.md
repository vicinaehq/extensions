# Ollama Translate

Translate text using local language models with Ollama directly from Vicinae. A privacy-focused alternative to Google Translate - your data never leaves your machine.

## Features

- **82 languages** supported
- **Multiple Ollama models** - Use any locally installed model (gemma3, llama3, mistral, etc.)
- **Auto-detect source language** - Automatically detects input language
- **Multiple commands**:
  - `translate` - Interactive translation with UI
  - `instant-copy` - Translate from clipboard and copy result
  - `instant-paste` - Translate and paste directly to active app

## Requirements

- [Ollama](https://ollama.com) installed and running locally
- At least one Ollama model downloaded (recommended: `ollama pull gemma3:1b` or `ollama pull translategemma`)

## Installation

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. The extension will be installed to Vicinae

## Configuration

Configure via Vicinae preferences:

- **Ollama Host**: Your Ollama server URL (default: `http://localhost:11434`)
- **Default Model**: Default model for translation (default: `gemma3:1b`)

## Commands

### translate (Interactive)
1. Open Vicinae and search for "translate"
2. Type text in the search bar
3. Select target language from dropdown
4. Translation appears automatically

### instant-copy
1. Copy text to clipboard
2. Run command "instant-copy"
3. Translated text is automatically copied to clipboard

### instant-paste  
1. Copy text to clipboard
2. Run command "instant-paste"
3. Translated text is pasted directly to your active application

## Supported Languages (82)

Afar, Afrikaans, Amharic, Arabic, Assamese, Azerbaijani, Bengali, Bulgarian, Burmese, Catalan, Chinese (Simplified), Chinese (Traditional), Croatian, Czech, Danish, Dutch, English, Estonian, Filipino, Finnish, French, Galician, Georgian, German, Greek, Gujarati, Hausa, Hebrew, Hindi, Hungarian, Icelandic, Igbo, Indonesian, Italian, Japanese, Javanese, Kannada, Kazakh, Khmer, Korean, Kurdish, Lao, Latvian, Lithuanian, Macedonian, Malagasy, Malay, Malayalam, Marathi, Mongolian, Nepali, Norwegian, Oriya, Oromo, Pashto, Persian, Polish, Portuguese, Punjabi, Romanian, Russian, Serbian, Sindhi, Sinhala, Slovak, Slovenian, Somali, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Tigrinya, Turkish, Ukrainian, Urdu, Uyghur, Uzbek, Vietnamese, Welsh, Wolof, Xhosa, Yoruba, Zulu

## Troubleshooting

- **Ollama not running**: Ensure Ollama is started (`ollama serve` in terminal)
- **No models found**: Download a model with `ollama pull <model>` (e.g., `ollama pull gemma3:1b`)
- **Translation fails**: Check that your model supports the target language

## Building

```bash
npm install
npm run build
```

## Development

```bash
npm run dev
```