import { auth } from "@/auth";
import {
  createMicrosoftState,
  microsoftAuthorizationUrl,
  microsoftRedirectUri,
  type MicrosoftAccountSlot,
} from "@/lib/microsoft-calendar";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  const slot = new URL(request.url).searchParams.get("slot");
  if (!userEmail || (slot !== "work" && slot !== "personal")) {
    return NextResponse.redirect(new URL("/api/auth/signin", request.url));
  }

  const state = createMicrosoftState(userEmail, slot as MicrosoftAccountSlot);
  const redirectUri = microsoftRedirectUri(request.url);
  const response = NextResponse.redirect(
    microsoftAuthorizationUrl(state, redirectUri),
  );
  (await cookies()).set("microsoft_oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
