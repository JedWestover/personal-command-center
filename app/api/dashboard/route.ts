import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { initialHabits, notes, priorities } from "@/lib/mock-data";

type GraphEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  start?: { dateTime?: string; timeZone?: string };
};

function toUtcIso(dateTime: string, timeZone?: string) {
  if (timeZone === "UTC" && !dateTime.endsWith("Z")) {
    return `${dateTime}Z`;
  }

  return dateTime;
}

export async function GET() {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Microsoft calendar access is unavailable." }, { status: 401 });
  }

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

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

  if (!graphResponse.ok) {
    return NextResponse.json({ error: "Microsoft calendar could not be loaded." }, { status: graphResponse.status });
  }

  const graphData = (await graphResponse.json()) as { value?: GraphEvent[] };
  const calendar = (graphData.value ?? [])
    .filter((event) => event.start?.dateTime)
    .map((event) => ({
      id: event.id,
      title: event.subject || "Untitled event",
      start: toUtcIso(event.start!.dateTime!, event.start!.timeZone),
      isAllDay: event.isAllDay ?? false,
      scope: "work" as const,
      color: "bg-indigo-500",
    }));

  return NextResponse.json({
    mode: "microsoft-graph",
    priorities,
    calendar,
    notes,
    habits: initialHabits,
    metrics: { unreadInbox: 12, tasksDue: 3, workoutsThisWeek: 4 }
  });
}
