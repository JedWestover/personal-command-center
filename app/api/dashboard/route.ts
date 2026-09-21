import { auth } from "@/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decryptGoogleRefreshToken, refreshGoogleAccessToken } from "@/lib/google-calendar";
import { initialHabits, notes, priorities } from "@/lib/mock-data";

type GraphEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  start?: { dateTime?: string; timeZone?: string };
};

type GoogleEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
};

type CalendarItem = {
  id: string;
  title: string;
  start: string;
  isAllDay: boolean;
  scope: "work" | "personal";
  color: string;
};

function toUtcIso(dateTime: string, timeZone?: string) {
  if (timeZone === "UTC" && !dateTime.endsWith("Z")) {
    return `${dateTime}Z`;
  }

  return dateTime;
}

export async function GET() {
  const session = await auth();
  const cookieStore = await cookies();
  const encryptedGoogleRefreshToken = cookieStore.get("google_calendar_refresh_token")?.value;

  if (!session?.accessToken && !encryptedGoogleRefreshToken) {
    return NextResponse.json({ error: "No calendar connection is available." }, { status: 401 });
  }

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const calendar: CalendarItem[] = [];

  if (session?.accessToken) {
    const params = new URLSearchParams({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      "$orderby": "start/dateTime",
      "$select": "id,subject,start,isAllDay",
      "$top": "50",
    });
    const graphResponse = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params}`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
      cache: "no-store",
    });

    if (graphResponse.ok) {
      const graphData = (await graphResponse.json()) as { value?: GraphEvent[] };
      calendar.push(...(graphData.value ?? [])
        .filter((event) => event.start?.dateTime)
        .map((event) => ({
          id: `microsoft-${event.id}`,
          title: event.subject || "Untitled event",
          start: toUtcIso(event.start!.dateTime!, event.start!.timeZone),
          isAllDay: event.isAllDay ?? false,
          scope: "work" as const,
          color: "bg-indigo-500",
        })));
    }
  }

  if (encryptedGoogleRefreshToken && process.env.GOOGLE_FAMILY_CALENDAR_ID) {
    const googleRefreshToken = decryptGoogleRefreshToken(encryptedGoogleRefreshToken);
    const googleTokens = googleRefreshToken ? await refreshGoogleAccessToken(googleRefreshToken) : null;

    if (googleTokens) {
      const googleParams = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
      });
      const googleResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_FAMILY_CALENDAR_ID)}/events?${googleParams}`, {
        headers: { Authorization: `Bearer ${googleTokens.access_token}` },
        cache: "no-store",
      });

      if (googleResponse.ok) {
        const googleData = (await googleResponse.json()) as { items?: GoogleEvent[] };
        calendar.push(...(googleData.items ?? [])
          .filter((event) => event.start?.dateTime || event.start?.date)
          .map((event) => ({
            id: `google-${event.id}`,
            title: event.summary || "Untitled event",
            start: event.start?.dateTime ?? `${event.start?.date}T00:00:00.000Z`,
            isAllDay: Boolean(event.start?.date),
            scope: "personal" as const,
            color: "bg-emerald-500",
          })));
      }
    }
  }

  calendar.sort((first, second) => first.start.localeCompare(second.start));

  return NextResponse.json({
    mode: "microsoft-graph-and-google",
    googleConnected: Boolean(encryptedGoogleRefreshToken),
    priorities,
    calendar,
    notes,
    habits: initialHabits,
    metrics: { unreadInbox: 12, tasksDue: 3, workoutsThisWeek: 4 }
  });
}
