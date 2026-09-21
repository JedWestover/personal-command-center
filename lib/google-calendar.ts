import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function encryptionKey() {
  return createHash("sha256").update(process.env.AUTH_SECRET ?? "").digest();
}

export function encryptGoogleRefreshToken(refreshToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptGoogleRefreshToken(value: string) {
  try {
    const payload = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function createGoogleState(userEmail: string) {
  const payload = Buffer.from(JSON.stringify({ userEmail, createdAt: Date.now(), nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyGoogleState(state: string, userEmail: string) {
  try {
    const [payload, signature] = state.split(".");
    const expectedSignature = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(payload).digest("base64url");
    const stateData = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userEmail: string; createdAt: number };

    return signature === expectedSignature && stateData.userEmail === userEmail && Date.now() - stateData.createdAt < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error("Google token exchange failed");
  }

  return (await response.json()) as { access_token: string; expires_in: number; refresh_token?: string };
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as { access_token: string; expires_in: number; refresh_token?: string };
}

export function googleAuthorizationUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPE,
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
