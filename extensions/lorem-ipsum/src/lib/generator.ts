import { CLASSIC_PARAGRAPH, CLASSIC_SENTENCES, CLASSIC_WORDS, WORD_COUNT, WORDS } from "./words";

export type Kind = "paragraphs" | "sentences" | "words" | "titles" | "list" | "html";
export type ListStyle = "dash" | "numbered" | "html";
export type HtmlTag = "p" | "div";

export const MAX_COUNT = 2000;

const WORDS_PER_SENTENCE_MIN = 4;
const WORDS_PER_SENTENCE_SPAN = 13; // 4–16
const SENTENCES_PER_PARAGRAPH_MIN = 4;
const SENTENCES_PER_PARAGRAPH_SPAN = 5; // 4–8
const WORDS_PER_TITLE_MIN = 3;
const WORDS_PER_TITLE_SPAN = 5; // 3–7
const WORDS_PER_LIST_ITEM_MIN = 4;
const WORDS_PER_LIST_ITEM_SPAN = 5; // 4–8
const CLASSIC_LIST_ITEM = "Lorem ipsum dolor sit amet";

export interface GenerateOptions {
  kind: Kind;
  count: number;
  startWithLorem: boolean;
  listStyle?: ListStyle;
  htmlTag?: HtmlTag;
}

export function generate({
  kind,
  count,
  startWithLorem,
  listStyle = "dash",
  htmlTag = "p",
}: GenerateOptions): string {
  const n = count | 0;
  if (n < 1) return "";

  switch (kind) {
    case "words":
      return generateWords(n, startWithLorem);
    case "sentences":
      return generateSentences(n, startWithLorem);
    case "paragraphs":
      return generateParagraphs(n, startWithLorem);
    case "titles":
      return generateTitle(n, startWithLorem);
    case "list":
      return generateList(n, startWithLorem, listStyle);
    case "html":
      return generateHtml(n, startWithLorem, htmlTag);
  }
}

export function generateWords(count: number, startWithLorem: boolean): string {
  const out = new Array<string>(count);
  let i = 0;
  let last = -1;

  if (startWithLorem) {
    const n = count < CLASSIC_WORDS.length ? count : CLASSIC_WORDS.length;
    for (; i < n; i++) out[i] = CLASSIC_WORDS[i];
    last = indexOfWord(out[i - 1]);
  }

  for (; i < count; i++) {
    last = nextIndex(last);
    out[i] = WORDS[last];
  }

  return out.join(" ");
}

export function generateSentences(count: number, startWithLorem: boolean): string {
  const out = new Array<string>(count);
  let i = 0;

  if (startWithLorem) {
    const n = count < CLASSIC_SENTENCES.length ? count : CLASSIC_SENTENCES.length;
    for (; i < n; i++) out[i] = CLASSIC_SENTENCES[i];
  }

  for (; i < count; i++) out[i] = randomSentence();
  return out.join(" ");
}

export function generateParagraphs(count: number, startWithLorem: boolean): string {
  const out = new Array<string>(count);
  let i = 0;

  if (startWithLorem) {
    out[0] = CLASSIC_PARAGRAPH;
    i = 1;
  }

  for (; i < count; i++) {
    out[i] = generateSentences(randomInSpan(SENTENCES_PER_PARAGRAPH_MIN, SENTENCES_PER_PARAGRAPH_SPAN), false);
  }

  return out.join("\n\n");
}

export function generateTitle(count: number, startWithLorem: boolean): string {
  const n = count > 0 ? count : randomInSpan(WORDS_PER_TITLE_MIN, WORDS_PER_TITLE_SPAN);
  const words = generateWords(n, startWithLorem).split(" ");
  for (let i = 0; i < words.length; i++) words[i] = capitalize(words[i]);
  return words.join(" ");
}

export function generateList(count: number, startWithLorem: boolean, style: ListStyle = "dash"): string {
  const n = count | 0;
  if (n < 1) return "";

  const bodies = new Array<string>(n);
  let i = 0;

  if (startWithLorem) {
    bodies[0] = CLASSIC_LIST_ITEM;
    i = 1;
  }

  for (; i < n; i++) {
    bodies[i] = capitalize(generateWords(randomInSpan(WORDS_PER_LIST_ITEM_MIN, WORDS_PER_LIST_ITEM_SPAN), false));
  }

  if (style === "html") {
    return `<ul>\n${bodies.map((body) => `  <li>${body}</li>`).join("\n")}\n</ul>`;
  }

  return bodies
    .map((body, index) => (style === "numbered" ? `${index + 1}. ${body}` : `- ${body}`))
    .join("\n");
}

export function generateHtml(count: number, startWithLorem: boolean, tag: HtmlTag = "p"): string {
  const paragraphs = generateParagraphs(count, startWithLorem).split("\n\n");
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const out = new Array<string>(paragraphs.length);
  for (let i = 0; i < paragraphs.length; i++) out[i] = `${open}${paragraphs[i]}${close}`;
  return out.join("\n");
}

export function generateUntilCharacters(target: number, startWithLorem: boolean): string {
  const n = target | 0;
  if (n < 1) return "";

  const parts: string[] = [];
  let length = 0;
  let last = -1;
  let classicIndex = 0;

  const nextWord = (): string => {
    if (startWithLorem && classicIndex < CLASSIC_WORDS.length) {
      const word = CLASSIC_WORDS[classicIndex++];
      last = indexOfWord(word);
      return word;
    }
    last = nextIndex(last);
    return WORDS[last];
  };

  while (length < n && parts.length < MAX_COUNT) {
    if (parts.length > 0 && n - length === 1) {
      parts[parts.length - 1] += ".";
      length += 1;
      break;
    }

    const word = nextWord();
    if (parts.length === 0) {
      const piece = word.slice(0, n);
      parts.push(piece);
      length = piece.length;
      if (piece.length < word.length) break;
      continue;
    }

    const room = n - length - 1;
    const piece = word.length <= room ? word : word.slice(0, room);
    parts.push(piece);
    length += 1 + piece.length;
    if (piece.length < word.length) break;
  }

  return parts.join(" ");
}

export function textStats(text: string): { characters: number; words: number; lines: number } {
  if (!text) return { characters: 0, words: 0, lines: 0 };
  let words = 0;
  let lines = 1;
  let inWord = false;

  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) {
      lines++;
      inWord = false;
    } else if (c <= 32) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      words++;
    }
  }

  return { characters: text.length, words, lines };
}

function randomSentence(): string {
  const count = randomInSpan(WORDS_PER_SENTENCE_MIN, WORDS_PER_SENTENCE_SPAN);
  const parts = new Array<string>(count);
  let last = -1;
  last = nextIndex(last);
  parts[0] = capitalize(WORDS[last]);
  for (let i = 1; i < count; i++) {
    last = nextIndex(last);
    parts[i] = WORDS[last];
  }

  if (count >= 8) {
    const commaAt = 2 + ((Math.random() * (count - 4)) | 0);
    parts[commaAt] = `${parts[commaAt]},`;
  }

  return `${parts.join(" ")}.`;
}

function nextIndex(last: number): number {
  let i = (Math.random() * WORD_COUNT) | 0;
  if (i === last) i = (i + 1) % WORD_COUNT;
  return i;
}

function randomInSpan(min: number, span: number): number {
  return min + ((Math.random() * span) | 0);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function indexOfWord(word: string | undefined): number {
  if (!word) return -1;
  const i = (WORDS as readonly string[]).indexOf(word);
  return i;
}
