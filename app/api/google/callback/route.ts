import { auth } from "@/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptGoogleRefreshToken, exchangeGoogleCode, verifyGoogleState } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const session = await auth();
  const userEmail = session?.user?.email;
  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_oauth_state")?.value;

  if (!code || !state || !storedState || !userEmail || state !== storedState || !verifyGoogleState(state, userEmail)) {
    return NextResponse.redirect(new URL("/?google=error", request.url));
  }

  try {
    const redirectUri = new URL("/api/google/callback", request.url).toString();
    const tokens = await exchangeGoogleCode(code, redirectUri);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL("/?google=error", request.url));
    }

    const response = NextResponse.redirect(new URL("/?google=connected", request.url));
    response.cookies.set("google_calendar_refresh_token", encryptGoogleRefreshToken(tokens.refresh_token), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.cookies.delete("google_oauth_state");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?google=error", request.url));
  }
}
