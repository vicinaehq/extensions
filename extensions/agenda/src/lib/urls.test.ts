import { describe, it, expect } from "vitest";
import { urlHandlers, extractUrls, getSupportedUrls } from "./urls";

describe("urls", () => {
  describe("extractUrls", () => {
    describe("given text with a single URL", () => {
      const text = "Join the meeting at https://example.com/meeting";

      describe("when extracting URLs", () => {
        it("then returns the URL", () => {
          expect(extractUrls(text)).toEqual(["https://example.com/meeting"]);
        });
      });
    });

    describe("given text with multiple URLs", () => {
      const text =
        "Main link: https://example.com and backup: http://backup.com/link";

      describe("when extracting URLs", () => {
        it("then returns all URLs", () => {
          expect(extractUrls(text)).toEqual([
            "https://example.com",
            "http://backup.com/link",
          ]);
        });
      });
    });

    describe("given text with no URLs", () => {
      const text = "This is plain text without any links";

      describe("when extracting URLs", () => {
        it("then returns empty array", () => {
          expect(extractUrls(text)).toEqual([]);
        });
      });
    });

    describe("given empty text", () => {
      describe("when extracting URLs", () => {
        it("then returns empty array", () => {
          expect(extractUrls("")).toEqual([]);
        });
      });
    });

    describe("given text with URL containing query params", () => {
      const text = "Link: https://example.com/page?foo=bar&baz=qux";

      describe("when extracting URLs", () => {
        it("then includes query parameters", () => {
          expect(extractUrls(text)).toEqual([
            "https://example.com/page?foo=bar&baz=qux",
          ]);
        });
      });
    });
  });

  describe("getSupportedUrls", () => {
    describe("given text with Google Meet link", () => {
      const text = "Join: https://meet.google.com/abc-defg-hij";

      describe("when getting supported URLs", () => {
        it("then returns the Meet URL", () => {
          expect(getSupportedUrls(text)).toEqual([
            "https://meet.google.com/abc-defg-hij",
          ]);
        });
      });
    });

    describe("given text with Zoom link", () => {
      const text = "Meeting: https://zoom.us/j/123456789";

      describe("when getting supported URLs", () => {
        it("then returns the Zoom URL", () => {
          expect(getSupportedUrls(text)).toEqual([
            "https://zoom.us/j/123456789",
          ]);
        });
      });
    });

    describe("given text with Zoom link with password", () => {
      const text = "Meeting: https://zoom.us/j/123456789?pwd=abc123";

      describe("when getting supported URLs", () => {
        it("then returns the Zoom URL with password", () => {
          expect(getSupportedUrls(text)).toEqual([
            "https://zoom.us/j/123456789?pwd=abc123",
          ]);
        });
      });
    });

    describe("given text with Microsoft Teams link", () => {
      const text =
        "Join Teams: https://teams.microsoft.com/l/meetup-join/abc123";

      describe("when getting supported URLs", () => {
        it("then returns the Teams URL", () => {
          expect(getSupportedUrls(text)).toEqual([
            "https://teams.microsoft.com/l/meetup-join/abc123",
          ]);
        });
      });
    });

    describe("given text with Webex link", () => {
      const text = "Webex: https://example.webex.com/meet/username";

      describe("when getting supported URLs", () => {
        it("then returns the Webex URL", () => {
          expect(getSupportedUrls(text)).toEqual([
            "https://example.webex.com/meet/username",
          ]);
        });
      });
    });

    describe("given text with GoToMeeting link", () => {
      const text = "GoTo: https://www.gotomeeting.com/join/123456789";

      describe("when getting supported URLs", () => {
        it("then returns the GoToMeeting URL", () => {
          expect(getSupportedUrls(text)).toEqual([
            "https://www.gotomeeting.com/join/123456789",
          ]);
        });
      });
    });

    describe("given text with unsupported URL", () => {
      const text = "Link: https://example.com/page";

      describe("when getting supported URLs", () => {
        it("then returns empty array", () => {
          expect(getSupportedUrls(text)).toEqual([]);
        });
      });
    });

    describe("given text with mixed supported and unsupported URLs", () => {
      const text =
        "Meeting: https://meet.google.com/abc-def and docs: https://docs.google.com/doc";

      describe("when getting supported URLs", () => {
        it("then returns only supported URLs", () => {
          expect(getSupportedUrls(text)).toEqual([
            "https://meet.google.com/abc-def",
          ]);
        });
      });
    });

    describe("given text with multiple meeting links", () => {
      const text =
        "Primary: https://meet.google.com/abc Backup: https://zoom.us/j/123";

      describe("when getting supported URLs", () => {
        it("then returns all supported URLs", () => {
          expect(getSupportedUrls(text)).toEqual([
            "https://meet.google.com/abc",
            "https://zoom.us/j/123",
          ]);
        });
      });
    });
  });

  describe("urlHandlers", () => {
    describe("given Google Meet pattern", () => {
      const handler = urlHandlers.find((h) => h.name === "Open Google Meet");

      it("then matches valid Meet URLs", () => {
        expect(handler?.pattern.test("meet.google.com/abc-defg-hij")).toBe(
          true,
        );
        expect(handler?.pattern.test("meet.google.com/xyz_123")).toBe(true);
      });

      it("then rejects invalid URLs", () => {
        expect(handler?.pattern.test("meet.google.com/")).toBe(false);
        expect(handler?.pattern.test("google.com/meet")).toBe(false);
      });
    });

    describe("given Zoom pattern", () => {
      const handler = urlHandlers.find((h) => h.name === "Open Zoom Meeting");

      it("then matches join URLs", () => {
        expect(handler?.pattern.test("zoom.us/j/123456789")).toBe(true);
      });

      it("then matches webinar URLs", () => {
        expect(handler?.pattern.test("zoom.us/w/123456789")).toBe(true);
      });

      it("then matches personal room URLs", () => {
        expect(handler?.pattern.test("zoom.us/my/username")).toBe(true);
      });

      it("then matches URLs with password", () => {
        expect(handler?.pattern.test("zoom.us/j/123?pwd=abc123")).toBe(true);
      });
    });

    describe("given Teams pattern", () => {
      const handler = urlHandlers.find(
        (h) => h.name === "Open Microsoft Teams",
      );

      it("then matches meetup-join URLs", () => {
        expect(
          handler?.pattern.test("teams.microsoft.com/l/meetup-join/abc"),
        ).toBe(true);
      });

      it("then matches meeting URLs", () => {
        expect(handler?.pattern.test("teams.microsoft.com/l/meeting/abc")).toBe(
          true,
        );
      });
    });

    describe("given Webex pattern", () => {
      const handler = urlHandlers.find((h) => h.name === "Open Webex Meeting");

      it("then matches meet URLs", () => {
        expect(handler?.pattern.test("webex.com/meet/user")).toBe(true);
      });

      it("then matches wbxmjs URLs", () => {
        expect(handler?.pattern.test("webex.com/wbxmjs/joinservice")).toBe(
          true,
        );
      });

      it("then matches wc/join URLs", () => {
        expect(handler?.pattern.test("webex.com/wc/join/123")).toBe(true);
      });
    });

    describe("given GoToMeeting pattern", () => {
      const handler = urlHandlers.find((h) => h.name === "Open GoToMeeting");

      it("then matches join URLs with numeric ID", () => {
        expect(handler?.pattern.test("gotomeeting.com/join/123456789")).toBe(
          true,
        );
      });

      it("then rejects non-numeric IDs", () => {
        expect(handler?.pattern.test("gotomeeting.com/join/abc")).toBe(false);
      });
    });
  });
});
