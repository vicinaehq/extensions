import { calendar, calendar_v3 } from "@googleapis/calendar";
import { googleAuth } from "./google-auth";
import { CalendarEvent, Calendar, CreateEventData, Attendee } from "../types";
import { nanoid } from "nanoid";

/**
 * Google Calendar API wrapper
 *
 * This class provides a clean interface to the Google Calendar API,
 * handling authentication and data transformation.
 */
export class GoogleCalendarAPI {
  private calendarClient: calendar_v3.Calendar | null = null;

  /**
   * Get authenticated Calendar API client
   */
  private async getCalendarClient(): Promise<calendar_v3.Calendar> {
    if (!this.calendarClient) {
      const authClient = await googleAuth.getAuthClient();
      this.calendarClient = calendar({ version: "v3", auth: authClient });
    }
    return this.calendarClient;
  }

  /**
   * List events from a calendar
   */
  async listEvents(
    calendarId: string = "primary",
    options?: {
      timeMin?: Date;
      timeMax?: Date;
      maxResults?: number;
      query?: string;
    }
  ): Promise<CalendarEvent[]> {
    const calendar = await this.getCalendarClient();

    const response = await calendar.events.list({
      calendarId,
      timeMin: (options?.timeMin || new Date()).toISOString(),
      timeMax: options?.timeMax?.toISOString(),
      maxResults: options?.maxResults || 50,
      singleEvents: true,
      orderBy: "startTime",
      q: options?.query,
    });

    const events = response.data.items || [];
    return events.map((event) => this.transformEvent(event, calendarId));
  }

  /**
   * List all available calendars
   */
  async listCalendars(): Promise<Calendar[]> {
    const calendar = await this.getCalendarClient();

    const response = await calendar.calendarList.list();
    const calendars = response.data.items || [];

    return calendars.map((cal) => ({
      id: cal.id!,
      summary: cal.summary || "Untitled Calendar",
      description: cal.description,
      primary: cal.primary,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor,
      accessRole: cal.accessRole,
    }));
  }

  /**
   * Create a new event
   */
  async createEvent(
    calendarId: string,
    eventData: CreateEventData
  ): Promise<CalendarEvent> {
    const calendar = await this.getCalendarClient();

    const requestBody: calendar_v3.Schema$Event = {
      summary: eventData.title,
      description: eventData.description,
      location: eventData.location,
      start: {
        dateTime: eventData.startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: eventData.endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      attendees: eventData.attendees?.map((email) => ({ email })),
    };

    // Add Google Meet conference if requested
    if (eventData.createMeet) {
      requestBody.conferenceData = {
        createRequest: {
          conferenceSolutionKey: { type: "hangoutsMeet" },
          requestId: nanoid(),
        },
      };
    }

    const response = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: eventData.createMeet ? 1 : 0,
      requestBody,
    });

    return this.transformEvent(response.data, calendarId);
  }

  /**
   * Transform Google Calendar event to app event format
   */
  private transformEvent(
    event: calendar_v3.Schema$Event,
    calendarId: string
  ): CalendarEvent {
    // Parse dates
    const startTime = new Date(
      event.start?.dateTime || event.start?.date || ""
    );
    const endTime = new Date(event.end?.dateTime || event.end?.date || "");
    const isAllDay = !!event.start?.date;

    // Extract Google Meet link
    const meetLink = event.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video"
    )?.uri;

    // Transform attendees
    const attendees: Attendee[] | undefined = event.attendees?.map((a) => ({
      email: a.email!,
      name: a.displayName,
      responseStatus: a.responseStatus as any,
      self: a.self,
    }));

    // Get user's response status
    const selfAttendee = event.attendees?.find((a) => a.self);
    const responseStatus = selfAttendee?.responseStatus as any;

    return {
      id: event.id!,
      title: event.summary || "Untitled Event",
      startTime,
      endTime,
      isAllDay,
      attendees,
      meetLink,
      htmlLink: event.htmlLink!,
      description: event.description,
      location: event.location,
      calendarId,
      status: event.status as any,
      responseStatus,
      recurrence: event.recurrence,
      recurringEventId: event.recurringEventId,
    };
  }

  /**
   * Search events across calendars
   */
  async searchEvents(query: string, maxResults: number = 30): Promise<CalendarEvent[]> {
    const calendar = await this.getCalendarClient();

    const response = await calendar.events.list({
      calendarId: "primary",
      q: query,
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: new Date().toISOString(),
    });

    const events = response.data.items || [];
    return events.map((event) => this.transformEvent(event, "primary"));
  }
}

/**
 * Singleton instance
 */
export const googleCalendarAPI = new GoogleCalendarAPI();
