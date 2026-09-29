# Personal Command Center

A polished Version 1 starter for a multi-account productivity dashboard. This first build intentionally uses mock data so you can run the UI before configuring Microsoft Graph, Supabase, or an AI provider.

## Included

- Next.js App Router and TypeScript
- Tailwind CSS
- Five dashboard sections: priorities, calendar, notes, habits, and daily metrics
- Work, personal, and combined account filters
- Interactive habit checkoffs
- Mock dashboard API route
- Supabase starter schema with Row Level Security
- Environment variable template
- VS Code recommendations
- Vercel and GitHub setup instructions

## Start in VS Code

1. Extract the ZIP.
2. Open the `personal-command-center` folder in VS Code.
3. Open the integrated terminal.
4. Run:

```bash
npm install
npm run dev
```

5. Open `http://localhost:3000`.

Use Node.js 20.9 or later.

## GitHub

```bash
git init
git add .
git commit -m "Initial Personal Command Center"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## Vercel

1. Import the GitHub repository in Vercel.
2. Keep the detected Next.js defaults.
3. Add environment variables from `.env.example` when you enable integrations.
4. Deploy.

## Integration roadmap

### Phase 2: Microsoft accounts

Register a Microsoft Entra application that supports both organizational directories and personal Microsoft accounts. Use the `common` tenant and delegated Microsoft Graph permissions. Keep tokens and Graph calls on the server side.

In the app registration, choose **Accounts in any organizational directory and personal Microsoft accounts** as the supported account type. Set `AUTH_MICROSOFT_ENTRA_ID_ISSUER` to `https://login.microsoftonline.com/common/v2.0`, then restart the dev server after changing `.env.local`. The sign-in flow shows Microsoft's account picker so you can switch between a work account and a personal account.

The current session holds one Microsoft account at a time. Supporting both Microsoft accounts simultaneously requires a linked-connections table with one encrypted refresh token per account, plus a separate "Connect work" / "Connect personal" OAuth flow. Do not try to store both refresh tokens in the single NextAuth JWT.

The dashboard now provides separate **Connect work** and **Connect personal** buttons. Sign in to the app first, connect one Microsoft account in each slot, and approve the `Calendars.Read` permission for both. Their events are then merged into the calendar and can be filtered with the `all`, `work`, and `personal` controls. The connections are kept in encrypted, HTTP-only browser cookies for this local version; move them to an encrypted database table before deploying multi-device or production support.

For the separate account connections, register this exact redirect URI under the Entra app's **Web** platform:

```text
http://localhost:3000/api/microsoft/callback
```

The URI must match `AUTH_URL` and the address in the browser exactly, including protocol, hostname, port, and path. The standard app sign-in also needs `http://localhost:3000/api/auth/callback/microsoft-entra-id` registered.

Microsoft task priorities use read-only Graph permissions: `Tasks.Read` for personal To Do and work Planner tasks, plus `Mail.ReadBasic` only for the optional flagged-email source. Flagged email tasks remain disabled unless `MICROSOFT_ENABLE_FLAGGED_EMAIL_TASKS=true` is explicitly set. The app does not request task or mail write permissions. After changing scopes, sign out and sign in again to grant consent for the updated permissions.

Suggested data sources:

- Calendar: Microsoft Graph calendar endpoints
- Important mail: Microsoft Graph mail endpoints
- Personal tasks: Microsoft Graph To Do task endpoints
- Work tasks: Microsoft Graph Planner endpoints where supported by the account and permissions

For true multi-account support, store one encrypted connection record per signed-in Microsoft identity. Label each connection `work` or `personal`, then merge normalized data in the dashboard API.

### Phase 3: Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and add the project URL, publishable key, and server-only service-role key.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It must never be prefixed with `NEXT_PUBLIC_` or imported by client components.
5. Replace mock habits and goals with server-side Supabase reads and writes, always filtering by the signed-in NextAuth user's email.

The daily water tracker stores each intake entry in `public.water_intake`. If your Supabase project already has the earlier schema, run the updated `supabase/schema.sql` in the SQL editor to create the table, index, and row-level security policy. The schema uses `if not exists` for tables and indexes and recreates its named policies safely.

The schema enables Row Level Security on every exposed app-owned table: habits, habit check-ins, goals, quick notes, linked account metadata, and selected calendar IDs. The browser roles have no direct table permissions. Provider refresh tokens belong in `private.linked_account_secrets` as encrypted values and must only be read or written by server code. The current local OAuth implementation still uses encrypted HTTP-only cookies; migrate those credentials to this private table before using multiple devices or deploying.

### Phase 4: AI daily brief

Create a server-only API route that receives already-normalized calendar, task, mail, habit, and goal summaries. Send the minimum needed data to your chosen AI provider and return a short daily brief. Do not expose provider keys in browser code.

## Suggested architecture

```text
VS Code -> GitHub -> Vercel
                         |
                         +-- Next.js UI
                         +-- Next.js Route Handlers
                              |-- Microsoft Graph
                              |-- Supabase
                              +-- AI provider
```

## Important security notes

- Never commit `.env.local`.
- Use delegated permissions and request only the scopes the app needs.
- Keep Microsoft access and refresh tokens out of the browser.
- Encrypt stored provider tokens.
- Keep Supabase Row Level Security enabled.
- Review personal-account and work-tenant consent requirements before production deployment.
