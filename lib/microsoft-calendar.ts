import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_SCOPE =
  "openid profile email offline_access User.Read Calendars.Read Tasks.Read Mail.ReadBasic";

export function microsoftRedirectUri(fallbackUrl: string) {
  return new URL(
    "/api/microsoft/callback",
    process.env.AUTH_URL ?? fallbackUrl,
  ).toString();
}

function encryptionKey() {
  return createHash("sha256")
    .update(process.env.AUTH_SECRET ?? "")
    .digest();
}

export type MicrosoftAccountSlot = "work" | "personal";

export function encryptMicrosoftRefreshToken(refreshToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}

export function decryptMicrosoftRefreshToken(value: string) {
  try {
    const payload = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      payload.subarray(0, 12),
    );
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([
      decipher.update(payload.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function createMicrosoftState(
  userEmail: string,
  slot: MicrosoftAccountSlot,
) {
  const payload = Buffer.from(
    JSON.stringify({
      userEmail,
      slot,
      createdAt: Date.now(),
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", process.env.AUTH_SECRET ?? "")
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyMicrosoftState(
  state: string,
  userEmail: string,
  slot: MicrosoftAccountSlot,
) {
  try {
    const [payload, signature] = state.split(".");
    const expectedSignature = createHmac(
      "sha256",
      process.env.AUTH_SECRET ?? "",
    )
      .update(payload)
      .digest("base64url");
    const stateData = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { userEmail: string; slot: MicrosoftAccountSlot; createdAt: number };
    return (
      signature === expectedSignature &&
      stateData.userEmail === userEmail &&
      stateData.slot === slot &&
      Date.now() - stateData.createdAt < 10 * 60 * 1000
    );
  } catch {
    return false;
  }
}

export function chooseMicrosoftCalendarId(
  calendars: Array<{
    id: string;
    name?: string;
    isDefaultCalendar?: boolean;
  }>,
  slot: MicrosoftAccountSlot,
) {
  const pattern =
    slot === "work"
      ? /(work|office|team|business|professional|project|calendar)/i
      : /(personal|home|family|private|custom|calendar)/i;

  const nominated = calendars.find((calendar) => {
    const name = (calendar.name ?? "").toLowerCase();
    if (!name) return false;
    if (slot === "work") {
      return /work|office|team|business|professional|project/.test(name);
    }
    return /personal|home|family|private|custom/.test(name);
  });

  return (
    nominated?.id ??
    calendars.find((calendar) => calendar.isDefaultCalendar)?.id ??
    calendars[0]?.id
  );
}

export function microsoftAuthorizationUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    prompt: "select_account",
    scope: MICROSOFT_SCOPE,
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code: string, redirectUri: string) {
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: MICROSOFT_SCOPE,
    }),
  });
  if (!response.ok) throw new Error("Microsoft token exchange failed");
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: MICROSOFT_SCOPE,
    }),
  });
  if (!response.ok) return null;
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}
