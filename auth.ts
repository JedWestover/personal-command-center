import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: {
        params: {
          scope: "openid profile email offline_access User.Read Calendars.Read",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (profile?.name) {
        token.name = profile.name;
      }

      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000;
      }

      if (token.accessToken && token.accessTokenExpires && Date.now() < token.accessTokenExpires - 60_000) {
        return token;
      }

      if (!token.refreshToken) {
        return token;
      }

      const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
          scope: "openid profile email offline_access User.Read Calendars.Read",
        }),
      });

      if (!response.ok) {
        return token;
      }

      const refreshed = (await response.json()) as { access_token: string; expires_in: number; refresh_token?: string };
      token.accessToken = refreshed.access_token;
      token.accessTokenExpires = Date.now() + refreshed.expires_in * 1000;
      token.refreshToken = refreshed.refresh_token ?? token.refreshToken;

      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken;

      if (session.user) {
        session.user.name = token.name ?? session.user.name ?? token.email ?? null;
      }

      return session;
    },
  },
});