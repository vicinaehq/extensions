import type { GoogleEvent } from "../api/calendar";

type MeetingEvent = Pick<
  GoogleEvent,
  "hangoutLink" | "conferenceData" | "location" | "description"
>;

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

function allUrls(text: string | undefined): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const matches = text.match(URL_RE);
  if (!matches || matches.length === 0) return [];
  return matches.map((m) => m.replace(/[.,;!?)\]]+$/, ""));
}

/**
 * Meeting URL priority: hangoutLink -> conferenceData video entryPoint uri
 * -> first video-call URL in location -> first video-call URL in description.
 *
 * The location/description fallback is deliberately restricted to URLs that
 * pass `isVideoCallUrl`: a docs/sheets/forms link in the description must
 * never become a "Join Meeting" action.
 */
export function getMeetingUrl(
  event: MeetingEvent | undefined,
): string | undefined {
  if (!event) return undefined;
  if (typeof event.hangoutLink === "string" && event.hangoutLink.length > 0) {
    return event.hangoutLink;
  }
  const entryPoints = event.conferenceData?.entryPoints;
  if (Array.isArray(entryPoints)) {
    const video = entryPoints.find(
      (e) => e.entryPointType === "video" && typeof e.uri === "string" && e.uri.length > 0,
    );
    if (video?.uri) return video.uri;
    const anyUri = entryPoints.find(
      (e) => typeof e.uri === "string" && (e.uri as string).length > 0,
    );
    if (anyUri?.uri) return anyUri.uri;
  }
  for (const url of allUrls(event.location)) {
    if (isVideoCallUrl(url)) return url;
  }
  for (const url of allUrls(event.description)) {
    if (isVideoCallUrl(url)) return url;
  }
  return undefined;
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isVideoCallUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  if (host === "meet.google.com" || host.endsWith(".meet.google.com")) return true;
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return true;
  if (host === "teams.microsoft.com" || host.endsWith(".teams.microsoft.com")) return true;
  if (host === "teams.live.com" || host.endsWith(".teams.live.com")) return true;
  if (host === "webex.com" || host.endsWith(".webex.com")) return true;
  if (host === "whereby.com" || host.endsWith(".whereby.com")) return true;
  if (host === "meet.jit.si" || host.endsWith(".meet.jit.si")) return true;
  if (host.includes("jitsi")) return true;
  return false;
}

export function getMeetingProviderName(url: string): string | undefined {
  const host = hostnameOf(url);
  if (!host) return undefined;
  if (host === "meet.google.com" || host.endsWith(".meet.google.com")) return "Google Meet";
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
  if (host === "teams.microsoft.com" || host.endsWith(".teams.microsoft.com")) {
    return "Microsoft Teams";
  }
  if (host === "teams.live.com" || host.endsWith(".teams.live.com")) return "Microsoft Teams";
  if (host === "webex.com" || host.endsWith(".webex.com")) return "Webex";
  if (host === "whereby.com" || host.endsWith(".whereby.com")) return "Whereby";
  if (host === "meet.jit.si" || host.endsWith(".meet.jit.si") || host.includes("jitsi")) {
    return "Jitsi";
  }
  return undefined;
}
