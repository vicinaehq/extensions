import { List, LocalStorage, showToast, Toast } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { ColorConvertListItem } from "./components/ColorConvert";

interface ConvertColorProps {
  arguments?: {
    text?: string;
  };
}

export default function ConvertColor(props: ConvertColorProps) {
  const [colorText, setColorText] = useState<string | null>(props.arguments?.text || null);
  const [lastConvertedColorFormat, setLastConvertedColorFormat] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    async function getLastFormatAndText() {
      setIsLoading(true);
      try {
        const lastFormat = await LocalStorage.getItem<string>("lastConvertedColorFormat");
        setLastConvertedColorFormat(lastFormat);
      } catch {
        // ignore
      }

      if (!colorText) {
        // Default example color if no text provided
        setColorText("#FF6363");
      }
      setIsLoading(false);
    }

    getLastFormatAndText();
  }, [colorText]);

  const format = [
    { title: "HEX", subtitle: "#FF6363", value: "hex" },
    { title: "HEX Lower Case", subtitle: "#ff6363", value: "hex-lower-case" },
    { title: "HEX No Prefix", subtitle: "FF6363", value: "hex-no-prefix" },
    { title: "RGB", subtitle: "rgb(255 99 99 / 100%)", value: "rgb" },
    { title: "RGB %", subtitle: "rgb(100% 38% 38% / 100%)", value: "rgb-percentage" },
    { title: "RGBA", subtitle: "rgba(255, 99, 99, 1)", value: "rgba" },
    { title: "RGBA %", subtitle: "rgba(100%, 39%, 39%, 1)", value: "rgba-percentage" },
    { title: "HSLA", subtitle: "hsla(0, 100%, 69%, 1)", value: "hsla" },
    { title: "HSVA", subtitle: "color(hsv 43.082 81.145 100)", value: "hsva" },
    { title: "OKLCH", subtitle: "oklch(0.6987 0.1902 23.468)", value: "oklch" },
    { title: "LCH", subtitle: "lch(63.127 68.676 28.723)", value: "lch" },
    { title: "P3", subtitle: "color(display-p3 0.9248 0.428 0.4078)", value: "p3" },
  ];

  if (lastConvertedColorFormat) {
    const index = format.findIndex((item) => item.value === lastConvertedColorFormat);
    if (index !== -1) {
      const [lastFormat] = format.splice(index, 1);
      format.unshift(lastFormat);
    }
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Enter or paste a color code (e.g. #FF6363, rgb(...))..."
      onSearchTextChange={(text) => {
        if (text && text.trim().length > 0) {
          setColorText(text.trim());
        }
      }}
    >
      {colorText &&
        format.map((item) => (
          <ColorConvertListItem key={item.value} text={colorText} title={item.title} value={item.value} />
        ))}
      <List.EmptyView
        title="No color entered"
        description="Type or paste any color format into the search bar above."
      />
    </List>
  );
}
