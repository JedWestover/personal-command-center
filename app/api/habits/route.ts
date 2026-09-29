import { auth } from "@/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

const DAY_MS = 24 * 60 * 60 * 1000;

type HabitRow = {
  id: string;
  name: string;
  target_per_week: number;
};

type CheckinRow = {
  habit_id: string;
  completed_on: string;
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(date: Date) {
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  return weekStart;
}

function getCurrentStreak(checkinDates: Set<string>, today: Date) {
  let streak = 0;
  const cursor = new Date(today);

  if (!checkinDates.has(dateKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  while (checkinDates.has(dateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

async function getOwnedHabits(ownerEmail: string) {
  const supabase = getSupabaseServerClient();
  const today = new Date();
  const weekStart = getWeekStart(today);
  const historyStart = new Date(today.getTime() - 365 * DAY_MS);

  const [{ data: habitRows, error: habitsError }, { data: checkinRows, error: checkinsError }] = await Promise.all([
    supabase
      .from("habits")
      .select("id, name, target_per_week")
      .eq("owner_email", ownerEmail)
      .order("created_at", { ascending: true }),
    supabase
      .from("habit_checkins")
      .select("habit_id, completed_on")
      .eq("owner_email", ownerEmail)
      .gte("completed_on", dateKey(historyStart))
      .lte("completed_on", dateKey(today)),
  ]);

  if (habitsError) throw habitsError;
  if (checkinsError) throw checkinsError;

  const habits = (habitRows ?? []) as HabitRow[];
  const checkins = (checkinRows ?? []) as CheckinRow[];
  const todayKey = dateKey(today);
  const weekStartKey = dateKey(weekStart);

  return habits.map((habit) => {
    const dates = new Set(
      checkins
        .filter((checkin) => checkin.habit_id === habit.id)
        .map((checkin) => checkin.completed_on),
    );
    const weeklyCompletions = [...dates].filter(
      (completedOn) => completedOn >= weekStartKey && completedOn <= todayKey,
    ).length;

    return {
      id: habit.id,
      title: habit.name,
      done: dates.has(todayKey),
      weeklyCompletions,
      currentStreak: getCurrentStreak(dates, today),
      targetPerWeek: habit.target_per_week,
    };
  });
}

export async function GET() {
  const session = await auth();
  const ownerEmail = session?.user?.email;

  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    return NextResponse.json({ habits: await getOwnedHabits(ownerEmail) });
  } catch {
    return NextResponse.json({ error: "Unable to load habits." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const ownerEmail = session?.user?.email;

  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { name?: string; targetPerWeek?: number };
    const name = body.name?.trim();
    const targetPerWeek = body.targetPerWeek ?? 7;

    if (!name || name.length > 80 || !Number.isInteger(targetPerWeek) || targetPerWeek < 1 || targetPerWeek > 7) {
      return NextResponse.json({ error: "Enter a habit name and a weekly target from 1 to 7." }, { status: 400 });
    }

    const { error } = await getSupabaseServerClient().from("habits").insert({
      owner_email: ownerEmail,
      name,
      target_per_week: targetPerWeek,
    });

    if (error) throw error;
    return NextResponse.json({ habits: await getOwnedHabits(ownerEmail) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to add habit." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  const ownerEmail = session?.user?.email;

  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { habitId?: string; done?: boolean };
    if (!body.habitId || typeof body.done !== "boolean") {
      return NextResponse.json({ error: "A habit and completion state are required." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: habit, error: habitError } = await supabase
      .from("habits")
      .select("id")
      .eq("id", body.habitId)
      .eq("owner_email", ownerEmail)
      .maybeSingle();

    if (habitError) throw habitError;
    if (!habit) return NextResponse.json({ error: "Habit not found." }, { status: 404 });

    const completedOn = dateKey(new Date());
    const query = body.done
      ? supabase.from("habit_checkins").upsert(
          { habit_id: body.habitId, owner_email: ownerEmail, completed_on: completedOn },
          { onConflict: "habit_id,completed_on" },
        )
      : supabase
          .from("habit_checkins")
          .delete()
          .eq("habit_id", body.habitId)
          .eq("owner_email", ownerEmail)
          .eq("completed_on", completedOn);
    const { error } = await query;

    if (error) throw error;
    return NextResponse.json({ habits: await getOwnedHabits(ownerEmail) });
  } catch {
    return NextResponse.json({ error: "Unable to update habit." }, { status: 500 });
  }
}
