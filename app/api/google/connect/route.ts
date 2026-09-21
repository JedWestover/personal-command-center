import { auth } from "@/auth";
import { createGoogleState, googleAuthorizationUrl } from "@/lib/google-calendar";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return NextResponse.redirect(new URL("/api/auth/signin", request.url));
  }

  const redirectUri = new URL("/api/google/callback", request.url).toString();
  const state = createGoogleState(userEmail);
  const response = NextResponse.redirect(googleAuthorizationUrl(state, redirectUri));
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
