export const urlHandlers = [
  {
    name: "Open Google Meet",
    pattern: /meet\.google\.com\/[a-zA-Z0-9_-]+/,
    action: (url: string) => url,
  },
  {
    name: "Open Zoom Meeting",
    pattern: /zoom\.us\/(j|w|my)\/[a-zA-Z0-9]+(\?pwd=[a-zA-Z0-9]+)?/,
    action: (url: string) => url,
  },
  {
    name: "Open Microsoft Teams",
    pattern: /teams\.microsoft\.com\/l\/(meetup-join|meeting)/,
    action: (url: string) => url,
  },
  {
    name: "Open Webex Meeting",
    pattern: /webex\.com\/(meet|wbxmjs|wc\/join)/,
    action: (url: string) => url,
  },
  {
    name: "Open GoToMeeting",
    pattern: /gotomeeting\.com\/join\/[0-9]+/,
    action: (url: string) => url,
  },
];

export const extractUrls = (text: string): string[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches || [];
};

export const getSupportedUrls = (text: string) => {
  const urls = extractUrls(text);
  return urls.filter((url) =>
    urlHandlers.some((handler) => handler.pattern.test(url)),
  );
};
