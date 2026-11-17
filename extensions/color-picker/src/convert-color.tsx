import { List, LocalStorage } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { ColorConvertListItem } from "./components/ColorConvert";
import { getFormattedColor } from "./lib/utils";

interface ConvertColorProps {
  arguments?: {
    text?: string;
  };
}

export default function ConvertColor(props: ConvertColorProps) {
  const [searchText, setSearchText] = useState(props.arguments?.text ?? "");
  const colorText = searchText.trim();
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
      setIsLoading(false);
    }

    getLastFormatAndText();
  }, []);

  const format = [
    { title: "HEX", subtitle: "#FF6363", value: "hex" },
    { title: "HEX Lower Case", subtitle: "#ff6363", value: "hex-lower-case" },
    { title: "HEX No Prefix", subtitle: "FF6363", value: "hex-no-prefix" },
    { title: "RGB", subtitle: "rgb(255, 99, 99)", value: "rgb" },
    { title: "RGB %", subtitle: "rgb(100% 38.824% 38.824%)", value: "rgb-percentage" },
    { title: "RGBA", subtitle: "rgba(255, 99, 99)", value: "rgba" },
    { title: "RGBA %", subtitle: "rgba(100%, 38.824%, 38.824%)", value: "rgba-percentage" },
    { title: "HSLA", subtitle: "hsla(0, 100%, 69.412%)", value: "hsla" },
    { title: "HSVA", subtitle: "color(--hsv 0 61.176% 100%)", value: "hsva" },
    { title: "OKLCH", subtitle: "oklch(70.027% 0.19071 23.399)", value: "oklch" },
    { title: "LCH", subtitle: "lch(63.30% 68.821 28.644)", value: "lch" },
    { title: "P3", subtitle: "color(display-p3 0.92832 0.42863 0.40964)", value: "p3" },
  ];

  if (lastConvertedColorFormat) {
    const index = format.findIndex((item) => item.value === lastConvertedColorFormat);
    if (index !== -1) {
      const [lastFormat] = format.splice(index, 1);
      format.unshift(lastFormat);
    }
  }

  const isValidColor = isValidColorText(colorText);

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      searchBarPlaceholder="Enter or paste a color code (e.g. #FF6363, rgb(...))..."
      onSearchTextChange={setSearchText}
    >
      {isValidColor &&
        format.map((item) => (
          <ColorConvertListItem key={item.value} text={colorText} title={item.title} value={item.value} />
        ))}
      {colorText ? (
        <List.EmptyView title="Not a valid color" description={`"${colorText}" is not a valid color.`} />
      ) : (
        <List.EmptyView
          title="No color entered"
          description="Type or paste any color format into the search bar above."
        />
      )}
    </List>
  );
}

function isValidColorText(text: string) {
  if (!text) return false;
  try {
    getFormattedColor(text, "hex");
    return true;
  } catch {
    return false;
  }
}
