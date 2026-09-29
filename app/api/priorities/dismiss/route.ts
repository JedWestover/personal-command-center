import { auth } from "@/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function POST(request: Request) {
  const ownerEmail = (await auth())?.user?.email;
  if (!ownerEmail) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      priorityId?: unknown;
      date?: unknown;
    };
    if (
      typeof body.priorityId !== "string" ||
      body.priorityId.length === 0 ||
      body.priorityId.length > 512 ||
      !isDateKey(body.date)
    ) {
      return NextResponse.json({ error: "A valid priority and date are required." }, { status: 400 });
    }

    const { error } = await getSupabaseServerClient()
      .from("priority_dismissals")
      .upsert(
        {
          owner_email: ownerEmail,
          priority_id: body.priorityId,
          dismissed_on: body.date,
        },
        { onConflict: "owner_email,priority_id,dismissed_on" },
      );
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to dismiss priority." }, { status: 500 });
  }
}