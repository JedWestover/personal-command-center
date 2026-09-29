import { auth } from "@/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

type GoalRow = {
  id: string;
  title: string;
  status: "active" | "paused" | "completed";
  target_date: string | null;
};

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function getOwnedGoals(ownerEmail: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("goals")
    .select("id,title,status,target_date")
    .eq("owner_email", ownerEmail)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as GoalRow[]).map((goal) => ({
    id: goal.id,
    title: goal.title,
    status: goal.status,
    targetDate: goal.target_date,
  }));
}

export async function GET() {
  const ownerEmail = (await auth())?.user?.email;
  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    return NextResponse.json({ goals: await getOwnedGoals(ownerEmail) });
  } catch {
    return NextResponse.json({ error: "Unable to load goals." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ownerEmail = (await auth())?.user?.email;
  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      title?: unknown;
      targetDate?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const targetDate = body.targetDate ?? null;
    if (
      !title ||
      title.length > 120 ||
      (targetDate !== null && !isDateKey(targetDate))
    ) {
      return NextResponse.json(
        { error: "Enter a goal title and a valid optional target date." },
        { status: 400 },
      );
    }

    const { error } = await getSupabaseServerClient().from("goals").insert({
      owner_email: ownerEmail,
      title,
      target_date: targetDate,
    });
    if (error) throw error;

    return NextResponse.json({ goals: await getOwnedGoals(ownerEmail) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to add goal." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const ownerEmail = (await auth())?.user?.email;
  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      goalId?: unknown;
      status?: unknown;
    };
    if (
      typeof body.goalId !== "string" ||
      (body.status !== "active" &&
        body.status !== "paused" &&
        body.status !== "completed")
    ) {
      return NextResponse.json({ error: "A goal and valid status are required." }, { status: 400 });
    }

    const { data, error } = await getSupabaseServerClient()
      .from("goals")
      .update({ status: body.status })
      .eq("id", body.goalId)
      .eq("owner_email", ownerEmail)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    }

    return NextResponse.json({ goals: await getOwnedGoals(ownerEmail) });
  } catch {
    return NextResponse.json({ error: "Unable to update goal." }, { status: 500 });
  }
}