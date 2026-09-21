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

Suggested data sources:

- Calendar: Microsoft Graph calendar endpoints
- Important mail: Microsoft Graph mail endpoints
- Personal tasks: Microsoft Graph To Do task endpoints
- Work tasks: Microsoft Graph Planner endpoints where supported by the account and permissions

For true multi-account support, store one encrypted connection record per signed-in Microsoft identity. Label each connection `work` or `personal`, then merge normalized data in the dashboard API.

### Phase 3: Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
4. Replace mock habits and goals with authenticated Supabase reads and writes.

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
