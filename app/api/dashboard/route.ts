import { auth } from "@/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
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
  localDate: string;
};

type PrioritySource = "todo" | "planner" | "event" | "habit" | "goal" | "email";

type PriorityItem = {
  id: string;
  title: string;
  scope: "work" | "personal" | "family";
  done: boolean;
  source: PrioritySource;
  dueAt?: string;
};

type TodoList = { id: string };
type TodoTask = {
  id: string;
  title?: string;
  status?: string;
  dueDateTime?: { dateTime?: string; timeZone?: string };
};
type PlannerTask = {
  id: string;
  title?: string;
  percentComplete?: number;
};
type HabitRow = { id: string; name: string };
type GoalRow = {
  id: string;
  title: string;
  target_date?: string | null;
};
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

function dateInUserTimezone(dateTime: string, timezoneOffsetMinutes: number) {
  return new Date(
    new Date(dateTime).getTime() - timezoneOffsetMinutes * 60_000,
  )
    .toISOString()
    .slice(0, 10);
}

function isDateKey(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
  todayKey: string,
  slot: MicrosoftAccountSlot,
): Promise<PriorityItem[]> {
  const priorities: PriorityItem[] = [];
  const lists = await graphGet<{ value?: TodoList[] }>(
    accessToken,
    "/me/todo/lists?$select=id",
  );

  for (const list of lists?.value ?? []) {
    const tasks = await graphGet<{ value?: TodoTask[] }>(
      accessToken,
      `/me/todo/lists/${encodeURIComponent(list.id)}/tasks?$filter=status ne 'completed'&$select=id,title,status,dueDateTime&$top=50`,
    );
    priorities.push(
      ...(tasks?.value ?? [])
        .filter((task) => {
          const dueDate = task.dueDateTime?.dateTime?.slice(0, 10);
          return task.status !== "completed" && dueDate && dueDate < todayKey;
        })
        .map((task) => ({
          id: `todo-${slot}-${list.id}-${task.id}`,
          title: task.title || "Untitled task",
          scope: slot,
          done: false,
          source: "todo" as const,
          dueAt: task.dueDateTime?.dateTime,
        })),
    );
  }

  if (slot === "work") {
    const plannerTasks = await graphGet<{ value?: PlannerTask[] }>(
      accessToken,
      "/me/planner/tasks?$select=id,title,percentComplete&$top=50",
    );
    priorities.push(
      ...(plannerTasks?.value ?? [])
        .filter((task) => (task.percentComplete ?? 0) < 100)
        .map((task) => ({
          id: `planner-${task.id}`,
          title: task.title || "Untitled task",
          scope: "work" as const,
          done: false,
          source: "planner" as const,
        })),
    );
  }

  if (process.env.MICROSOFT_ENABLE_FLAGGED_EMAIL_TASKS === "true") {
    const messages = await graphGet<{ value?: FlaggedMessage[] }>(
      accessToken,
      "/me/mailFolders/inbox/messages?$filter=flag/flagStatus eq 'flagged'&$select=id,subject,flag&$top=50",
    );
    priorities.push(
      ...(messages?.value ?? []).map((message) => ({
        id: `mail-${message.id}`,
        title: `Follow up: ${message.subject || "Flagged email"}`,
        scope: slot,
        done: false,
        source: "email" as const,
      })),
    );
  }

  return priorities;
}

async function loadHabitAndGoalPriorities(
  ownerEmail: string,
): Promise<PriorityItem[]> {
  const supabase = getSupabaseServerClient();
  const habitDateKey = new Date().toISOString().slice(0, 10);
  const [habitsResult, checkinsResult, goalsResult] = await Promise.all([
    supabase
      .from("habits")
      .select("id,name")
      .eq("owner_email", ownerEmail)
      .order("created_at", { ascending: true }),
    supabase
      .from("habit_checkins")
      .select("habit_id")
      .eq("owner_email", ownerEmail)
      .eq("completed_on", habitDateKey),
    supabase
      .from("goals")
      .select("id,title,target_date")
      .eq("owner_email", ownerEmail)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);

  if (habitsResult.error) throw habitsResult.error;
  if (checkinsResult.error) throw checkinsResult.error;
  if (goalsResult.error) throw goalsResult.error;

  const completedHabitIds = new Set(
    (checkinsResult.data ?? []).map((checkin) => checkin.habit_id as string),
  );
  const habitPriorities = ((habitsResult.data ?? []) as HabitRow[])
    .filter((habit) => !completedHabitIds.has(habit.id))
    .map((habit) => ({
      id: `habit-${habit.id}`,
      title: habit.name,
      scope: "personal" as const,
      done: false,
      source: "habit" as const,
    }));
  const goalPriorities = ((goalsResult.data ?? []) as GoalRow[]).map((goal) => ({
    id: `goal-${goal.id}`,
    title: goal.title,
    scope: "personal" as const,
    done: false,
    source: "goal" as const,
    dueAt: goal.target_date ?? undefined,
  }));

  return [...habitPriorities, ...goalPriorities];
}

async function loadDismissedPriorityIds(ownerEmail: string, date: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("priority_dismissals")
    .select("priority_id")
    .eq("owner_email", ownerEmail)
    .eq("dismissed_on", date);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.priority_id as string));
}

export async function GET(request: Request) {
  const session = await auth();
  const cookieStore = await cookies();
  const requestUrl = new URL(request.url);
  const requestedDate = requestUrl.searchParams.get("date");
  const todayKey = isDateKey(requestedDate)
    ? requestedDate
    : new Date().toISOString().slice(0, 10);
  const parsedOffset = Number(requestUrl.searchParams.get("timezoneOffsetMinutes"));
  const timezoneOffsetMinutes =
    Number.isInteger(parsedOffset) && Math.abs(parsedOffset) <= 840
      ? parsedOffset
      : 0;
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
      ...(await loadMicrosoftPriorities(tokens.access_token, todayKey, slot)),
    );
    if (tokens.refresh_token) rotatedRefreshTokens[slot] = tokens.refresh_token;
  }

  if (!microsoftTokens.personal && session?.accessToken) {
    microsoftTokens.personal = session.accessToken;
    microsoftConnections.personal = true;
    livePriorities.push(
      ...(await loadMicrosoftPriorities(
        session.accessToken,
        todayKey,
        "personal",
      )),
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
            localDate: dateInUserTimezone(
              toUtcIso(event.start!.dateTime!, event.start!.timeZone),
              timezoneOffsetMinutes,
            ),
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
              localDate:
                event.start?.date ??
                dateInUserTimezone(
                  event.start!.dateTime!,
                  timezoneOffsetMinutes,
                ),
            })),
        );
      }
    }
  }

  livePriorities.push(
    ...calendar
      .filter((event) => event.localDate === todayKey)
      .map((event) => ({
        id: `event-${event.id}`,
        title: event.title,
        scope: event.scope,
        done: false,
        source: "event" as const,
        dueAt: event.start,
      })),
  );

  if (session?.user?.email) {
    try {
      livePriorities.push(
        ...(await loadHabitAndGoalPriorities(session.user.email)),
      );
    } catch (error) {
      console.error("Unable to load habit and goal priorities.", error);
    }
  }

  const sourceOrder: Record<PrioritySource, number> = {
    todo: 0,
    event: 1,
    planner: 2,
    habit: 3,
    goal: 4,
    email: 5,
  };
  livePriorities.sort(
    (first, second) => sourceOrder[first.source] - sourceOrder[second.source],
  );

  let visiblePriorities = livePriorities;
  if (session?.user?.email) {
    try {
      const dismissedIds = await loadDismissedPriorityIds(
        session.user.email,
        todayKey,
      );
      visiblePriorities = livePriorities.filter(
        (priority) => !dismissedIds.has(priority.id),
      );
    } catch (error) {
      console.error("Unable to load dismissed priorities.", error);
    }
  }

  calendar.sort((first, second) => first.start.localeCompare(second.start));

  const response = NextResponse.json({
    mode: "microsoft-graph-and-google",
    microsoftConnected: microsoftConnections,
    googleConnected: Boolean(encryptedGoogleRefreshToken),
    priorities: visiblePriorities,
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
