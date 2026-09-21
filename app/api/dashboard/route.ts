import { NextResponse } from "next/server";
import { calendar, initialHabits, notes, priorities } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({
    mode: "mock",
    priorities,
    calendar,
    notes,
    habits: initialHabits,
    metrics: { unreadInbox: 12, tasksDue: 3, workoutsThisWeek: 4 }
  });
}
