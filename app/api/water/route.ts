import { auth } from "@/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

const DAILY_GOAL_OUNCES = 64;

type WaterEntryRow = {
  id: string;
  amount_ounces: number;
  created_at: string;
};

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function getWaterSnapshot(ownerEmail: string, date: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("water_intake")
    .select("id, amount_ounces, created_at")
    .eq("owner_email", ownerEmail)
    .eq("consumed_on", date)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const entries = (data ?? []) as WaterEntryRow[];
  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      amountOunces: entry.amount_ounces,
      createdAt: entry.created_at,
    })),
    totalOunces: entries.reduce((total, entry) => total + entry.amount_ounces, 0),
    goalOunces: DAILY_GOAL_OUNCES,
  };
}

export async function GET(request: Request) {
  const ownerEmail = (await auth())?.user?.email;
  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const date = new URL(request.url).searchParams.get("date");
  if (!isDateKey(date)) {
    return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getWaterSnapshot(ownerEmail, date));
  } catch {
    return NextResponse.json({ error: "Unable to load water intake." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ownerEmail = (await auth())?.user?.email;
  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      date?: unknown;
      amountOunces?: unknown;
    };
    if (
      !isDateKey(body.date) ||
      typeof body.amountOunces !== "number" ||
      !Number.isInteger(body.amountOunces) ||
      body.amountOunces < 1 ||
      body.amountOunces > 128
    ) {
      return NextResponse.json({ error: "Enter a valid date and amount." }, { status: 400 });
    }

    const { error } = await getSupabaseServerClient()
      .from("water_intake")
      .insert({
        owner_email: ownerEmail,
        consumed_on: body.date,
        amount_ounces: body.amountOunces,
      });
    if (error) throw error;

    return NextResponse.json(await getWaterSnapshot(ownerEmail, body.date), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to add water intake." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const ownerEmail = (await auth())?.user?.email;
  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      date?: unknown;
      entryId?: unknown;
    };
    if (!isDateKey(body.date) || typeof body.entryId !== "string") {
      return NextResponse.json({ error: "A valid entry is required." }, { status: 400 });
    }

    const { data, error } = await getSupabaseServerClient()
      .from("water_intake")
      .delete()
      .eq("id", body.entryId)
      .eq("owner_email", ownerEmail)
      .eq("consumed_on", body.date)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Water entry not found." }, { status: 404 });
    }

    return NextResponse.json(await getWaterSnapshot(ownerEmail, body.date));
  } catch {
    return NextResponse.json({ error: "Unable to undo water intake." }, { status: 500 });
  }
}