import { Color, Icon } from "@vicinae/api";

export function getIcon(contentType?: string) {
  const contentGroup = contentType?.split("/")[0];
  let icon: Icon = Icon.Circle;
  switch (contentGroup) {
    case "":
      icon = Icon.ArrowRight;
      break;
    case "image":
      icon = Icon.Eye;
      break;
    case "audio":
      icon = Icon.Phone;
      break;
    case "video":
      icon = Icon.Video;
      break;
    case "text":
      icon = Icon.BlankDocument;
      break;
    case "application":
      icon = Icon.BlankDocument;
      break;
  }
  return { source: icon, tintColor: Color.Blue };
}
