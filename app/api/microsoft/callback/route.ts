import { auth } from "@/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  chooseMicrosoftCalendarId,
  encryptMicrosoftRefreshToken,
  exchangeMicrosoftCode,
  microsoftRedirectUri,
  verifyMicrosoftState,
  type MicrosoftAccountSlot,
} from "@/lib/microsoft-calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const session = await auth();
  const userEmail = session?.user?.email;
  const cookieStore = await cookies();
  const storedState = cookieStore.get("microsoft_oauth_state")?.value;

  if (!code || !state || !storedState || !userEmail) {
    return NextResponse.redirect(new URL("/?microsoft=error", request.url));
  }

  let stateData: { slot: MicrosoftAccountSlot };
  try {
    stateData = JSON.parse(
      Buffer.from(state.split(".")[0], "base64url").toString("utf8"),
    ) as { slot: MicrosoftAccountSlot };
  } catch {
    return NextResponse.redirect(new URL("/?microsoft=error", request.url));
  }

  if (!verifyMicrosoftState(state, userEmail, stateData.slot)) {
    return NextResponse.redirect(new URL("/?microsoft=error", request.url));
  }

  try {
    const redirectUri = microsoftRedirectUri(request.url);
    const tokens = await exchangeMicrosoftCode(code, redirectUri);
    if (!tokens.refresh_token)
      return NextResponse.redirect(new URL("/?microsoft=error", request.url));

    const calendarListResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isDefaultCalendar&$top=100",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      },
    );

    const calendars = calendarListResponse.ok
      ? ((await calendarListResponse.json()) as {
          value?: Array<{
            id: string;
            name?: string;
            isDefaultCalendar?: boolean;
          }>;
        })
      : null;
    const selectedCalendarId = chooseMicrosoftCalendarId(
      calendars?.value ?? [],
      stateData.slot,
    );

    const response = NextResponse.redirect(
      new URL("/?microsoft=connected", request.url),
    );
    response.cookies.set(
      `microsoft_${stateData.slot}_refresh_token`,
      encryptMicrosoftRefreshToken(tokens.refresh_token),
      {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 180,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
    if (selectedCalendarId) {
      response.cookies.set(
        `microsoft_${stateData.slot}_calendar_id`,
        selectedCalendarId,
        {
          httpOnly: true,
          maxAge: 60 * 60 * 24 * 180,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
      );
    }
    response.cookies.delete("microsoft_oauth_state");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?microsoft=error", request.url));
  }
}
