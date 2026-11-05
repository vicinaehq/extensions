import { Color, Icon } from "@vicinae/api";

interface ProviderStyle {
  icon: Icon;
  color: Color;
}

const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  anthropic: { icon: Icon.Claude, color: Color.Orange },
  openai: { icon: Icon.Openai, color: Color.Green },
  google: { icon: Icon.Gemini, color: Color.Blue },
  ollama: { icon: Icon.Ollama, color: Color.Purple },
  deepseek: { icon: Icon.Deepseek, color: Color.Blue },
  mistral: { icon: Icon.Mistral, color: Color.Orange },
};

const DEFAULT_STYLE: ProviderStyle = {
  icon: Icon.Stars,
  color: Color.SecondaryText,
};

export function providerStyle(model: string): ProviderStyle {
  const slash = model.indexOf("/");
  const provider = slash >= 0 ? model.slice(0, slash).toLowerCase() : "";
  return PROVIDER_STYLES[provider] ?? DEFAULT_STYLE;
}
