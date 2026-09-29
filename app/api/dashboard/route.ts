import { auth } from "@/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  decryptGoogleRefreshToken,
  refreshGoogleAccessToken,
} from "@/lib/google-calendar";
import {
  chooseMicrosoftCalendarId,
  decryptMicrosoftRefreshToken,
  encryptMicrosoftRefreshToken,
  refreshMicrosoftAccessToken,
  type MicrosoftAccountSlot,
} from "@/lib/microsoft-calendar";

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
  scope: "work" | "personal" | "family";
  color: string;
};

type PriorityItem = {
  id: string;
  title: string;
  scope: "work" | "personal" | "family";
  done: boolean;
};

type TodoList = { id: string };
type TodoTask = { id: string; title?: string; status?: string };
type PlannerTask = { id: string; title?: string; percentComplete?: number };
type FlaggedMessage = {
  id: string;
  subject?: string;
  flag?: { flagStatus?: string };
};

function toUtcIso(dateTime: string, timeZone?: string) {
  if (timeZone === "UTC" && !dateTime.endsWith("Z")) {
    return `${dateTime}Z`;
  }

  return dateTime;
}

async function graphGet<T>(accessToken: string, path: string) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function loadMicrosoftPriorities(
  accessToken: string,
): Promise<PriorityItem[]> {
  const priorities: PriorityItem[] = [];
  const lists = await graphGet<{ value?: TodoList[] }>(
    accessToken,
    "/me/todo/lists?$select=id",
  );

  for (const list of lists?.value ?? []) {
    const tasks = await graphGet<{ value?: TodoTask[] }>(
      accessToken,
      `/me/todo/lists/${encodeURIComponent(list.id)}/tasks?$filter=status ne 'completed'&$select=id,title,status&$top=50`,
    );
    priorities.push(
      ...(tasks?.value ?? []).map((task) => ({
        id: `todo-${task.id}`,
        title: task.title || "Untitled task",
        scope: "personal" as const,
        done: task.status === "completed",
      })),
    );
  }

  const plannerTasks = await graphGet<{ value?: PlannerTask[] }>(
    accessToken,
    "/me/planner/tasks?$filter=percentComplete lt 100&$select=id,title,percentComplete&$top=50",
  );
  priorities.push(
    ...(plannerTasks?.value ?? []).map((task) => ({
      id: `planner-${task.id}`,
      title: task.title || "Untitled task",
      scope: "work" as const,
      done: (task.percentComplete ?? 0) >= 100,
    })),
  );

  if (process.env.MICROSOFT_ENABLE_FLAGGED_EMAIL_TASKS === "true") {
    const messages = await graphGet<{ value?: FlaggedMessage[] }>(
      accessToken,
      "/me/mailFolders/inbox/messages?$filter=flag/flagStatus eq 'flagged'&$select=id,subject,flag&$top=50",
    );
    priorities.push(
      ...(messages?.value ?? []).map((message) => ({
        id: `mail-${message.id}`,
        title: `Follow up: ${message.subject || "Flagged email"}`,
        scope: "personal" as const,
        done: false,
      })),
    );
  }

  return priorities;
}

export async function GET() {
  const session = await auth();
  const cookieStore = await cookies();
  const encryptedGoogleRefreshToken = cookieStore.get(
    "google_calendar_refresh_token",
  )?.value;

  if (!session?.accessToken && !encryptedGoogleRefreshToken) {
    return NextResponse.json(
      { error: "No calendar connection is available." },
      { status: 401 },
    );
  }

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const calendar: CalendarItem[] = [];
  const livePriorities: PriorityItem[] = [];
  const microsoftConnections = { work: false, personal: false };
  const microsoftTokens: Partial<Record<MicrosoftAccountSlot, string>> = {};
  const rotatedRefreshTokens: Partial<Record<MicrosoftAccountSlot, string>> =
    {};

  for (const slot of ["work", "personal"] as const) {
    const encryptedToken = cookieStore.get(
      `microsoft_${slot}_refresh_token`,
    )?.value;
    const refreshToken = encryptedToken
      ? decryptMicrosoftRefreshToken(encryptedToken)
      : null;
    if (!refreshToken) continue;
    const tokens = await refreshMicrosoftAccessToken(refreshToken);
    if (!tokens) continue;
    microsoftConnections[slot] = true;
    microsoftTokens[slot] = tokens.access_token;
    livePriorities.push(
      ...(await loadMicrosoftPriorities(tokens.access_token)),
    );
    if (tokens.refresh_token) rotatedRefreshTokens[slot] = tokens.refresh_token;
  }

  if (!microsoftTokens.personal && session?.accessToken) {
    microsoftTokens.personal = session.accessToken;
    microsoftConnections.personal = true;
    livePriorities.push(
      ...(await loadMicrosoftPriorities(session.accessToken)),
    );
  }

  for (const slot of ["work", "personal"] as const) {
    const accessToken = microsoftTokens[slot];
    if (!accessToken) continue;

    const calendarIdCookie = cookieStore.get(
      `microsoft_${slot}_calendar_id`,
    )?.value;
    const calendarListResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isDefaultCalendar&$top=100",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );

    const calendarList = calendarListResponse.ok
      ? ((await calendarListResponse.json()) as {
          value?: Array<{
            id: string;
            name?: string;
            isDefaultCalendar?: boolean;
          }>;
        })
      : null;

    const fallbackCalendarId = chooseMicrosoftCalendarId(
      calendarList?.value ?? [],
      slot,
    );
    const selectedCalendarId =
      calendarIdCookie &&
      calendarList?.value?.some((item) => item.id === calendarIdCookie)
        ? calendarIdCookie
        : fallbackCalendarId;

    if (!selectedCalendarId) continue;

    const calendarUrl = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(selectedCalendarId)}/calendarView?${new URLSearchParams(
      {
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        $orderby: "start/dateTime",
        $select: "id,subject,start,isAllDay",
        $top: "50",
      },
    )}`;

    const graphResponse = await fetch(calendarUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
      cache: "no-store",
    });

    if (graphResponse.ok) {
      const graphData = (await graphResponse.json()) as {
        value?: GraphEvent[];
      };
      calendar.push(
        ...(graphData.value ?? [])
          .filter((event) => event.start?.dateTime)
          .map((event) => ({
            id: `microsoft-${slot}-${selectedCalendarId}-${event.id}`,
            title: event.subject || "Untitled event",
            start: toUtcIso(event.start!.dateTime!, event.start!.timeZone),
            isAllDay: event.isAllDay ?? false,
            scope: slot,
            color: slot === "work" ? "bg-blue-500" : "bg-purple-500",
          })),
      );
    }
  }

  if (encryptedGoogleRefreshToken && process.env.GOOGLE_FAMILY_CALENDAR_ID) {
    const googleRefreshToken = decryptGoogleRefreshToken(
      encryptedGoogleRefreshToken,
    );
    const googleTokens = googleRefreshToken
      ? await refreshGoogleAccessToken(googleRefreshToken)
      : null;

    if (googleTokens) {
      const googleParams = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
      });
      const googleResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_FAMILY_CALENDAR_ID)}/events?${googleParams}`,
        {
          headers: { Authorization: `Bearer ${googleTokens.access_token}` },
          cache: "no-store",
        },
      );

      if (googleResponse.ok) {
        const googleData = (await googleResponse.json()) as {
          items?: GoogleEvent[];
        };
        calendar.push(
          ...(googleData.items ?? [])
            .filter((event) => event.start?.dateTime || event.start?.date)
            .map((event) => ({
              id: `google-${event.id}`,
              title: event.summary || "Untitled event",
              start:
                event.start?.dateTime ?? `${event.start?.date}T00:00:00.000Z`,
              isAllDay: Boolean(event.start?.date),
              scope: "family" as const,
              color: "bg-green-500",
            })),
        );
      }
    }
  }

  calendar.sort((first, second) => first.start.localeCompare(second.start));

  const response = NextResponse.json({
    mode: "microsoft-graph-and-google",
    microsoftConnected: microsoftConnections,
    googleConnected: Boolean(encryptedGoogleRefreshToken),
    priorities: livePriorities,
    calendar,
    notes: [],
    habits: [],
    metrics: { unreadInbox: 0, tasksDue: 0, workoutsThisWeek: 0 },
  });

  for (const slot of ["work", "personal"] as const) {
    if (rotatedRefreshTokens[slot]) {
      response.cookies.set(
        `microsoft_${slot}_refresh_token`,
        encryptMicrosoftRefreshToken(rotatedRefreshTokens[slot]!),
        {
          httpOnly: true,
          maxAge: 60 * 60 * 24 * 180,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
      );
    }
  }

  return response;
}
