-- App-owned data is keyed to the NextAuth user's email because this app does
-- not use Supabase Auth. All application reads and writes go through the
-- server-only service-role client with an explicit owner_email filter.

create extension if not exists pgcrypto;

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  target_per_week int not null default 7 check (target_per_week between 1 and 7),
  created_at timestamptz not null default now()
);

create table if not exists public.habit_checkins (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  habit_id uuid not null references public.habits(id) on delete cascade,
  completed_on date not null default current_date,
  unique (habit_id, completed_on)
);

create table if not exists public.water_intake (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  amount_ounces int not null check (amount_ounces between 1 and 128),
  consumed_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  target_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.priority_dismissals (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  priority_id text not null,
  dismissed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (owner_email, priority_id, dismissed_on)
);

create table if not exists public.quick_notes (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  title text not null,
  body text not null default '',
  scope text not null default 'personal' check (scope in ('work', 'personal', 'family')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  provider text not null check (provider in ('microsoft', 'google')),
  account_slot text not null check (account_slot in ('work', 'personal', 'family')),
  provider_account_id text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_email, provider, account_slot)
);

create table if not exists public.selected_calendar_ids (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  provider text not null check (provider in ('microsoft', 'google')),
  account_slot text not null check (account_slot in ('work', 'personal', 'family')),
  calendar_id text not null,
  calendar_name text,
  selected boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_email, provider, account_slot, calendar_id)
);

-- Refresh tokens are kept outside the exposed public schema. Values must be
-- encrypted before insertion; this table is only accessed by server code.
create schema if not exists private;

create table if not exists private.linked_account_secrets (
  linked_account_id uuid primary key references public.linked_accounts(id) on delete cascade,
  encrypted_refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.habits enable row level security;
alter table public.habit_checkins enable row level security;
alter table public.water_intake enable row level security;
alter table public.goals enable row level security;
alter table public.priority_dismissals enable row level security;
alter table public.quick_notes enable row level security;
alter table public.linked_accounts enable row level security;
alter table public.selected_calendar_ids enable row level security;

drop policy if exists "Users manage own habits" on public.habits;
create policy "Users manage own habits" on public.habits for all
  using ((auth.jwt() ->> 'email') = owner_email)
  with check ((auth.jwt() ->> 'email') = owner_email);

drop policy if exists "Users manage own checkins" on public.habit_checkins;
create policy "Users manage own checkins" on public.habit_checkins for all
  using ((auth.jwt() ->> 'email') = owner_email)
  with check ((auth.jwt() ->> 'email') = owner_email);

drop policy if exists "Users manage own water intake" on public.water_intake;
create policy "Users manage own water intake" on public.water_intake for all
  using ((auth.jwt() ->> 'email') = owner_email)
  with check ((auth.jwt() ->> 'email') = owner_email);

drop policy if exists "Users manage own goals" on public.goals;
create policy "Users manage own goals" on public.goals for all
  using ((auth.jwt() ->> 'email') = owner_email)
  with check ((auth.jwt() ->> 'email') = owner_email);

drop policy if exists "Users manage own priority dismissals" on public.priority_dismissals;
create policy "Users manage own priority dismissals" on public.priority_dismissals for all
  using ((auth.jwt() ->> 'email') = owner_email)
  with check ((auth.jwt() ->> 'email') = owner_email);

drop policy if exists "Users manage own quick notes" on public.quick_notes;
create policy "Users manage own quick notes" on public.quick_notes for all
  using ((auth.jwt() ->> 'email') = owner_email)
  with check ((auth.jwt() ->> 'email') = owner_email);

drop policy if exists "Users manage own linked accounts" on public.linked_accounts;
create policy "Users manage own linked accounts" on public.linked_accounts for all
  using ((auth.jwt() ->> 'email') = owner_email)
  with check ((auth.jwt() ->> 'email') = owner_email);

drop policy if exists "Users manage own selected calendars" on public.selected_calendar_ids;
create policy "Users manage own selected calendars" on public.selected_calendar_ids for all
  using ((auth.jwt() ->> 'email') = owner_email)
  with check ((auth.jwt() ->> 'email') = owner_email);

-- Browser roles cannot access app-owned rows. The server-only service role is
-- used by Next.js and bypasses RLS while still applying owner_email filters.
revoke all on public.habits, public.habit_checkins, public.goals,
  public.water_intake, public.priority_dismissals, public.quick_notes,
  public.linked_accounts, public.selected_calendar_ids
  from anon, authenticated;
revoke all on private.linked_account_secrets from anon, authenticated;
grant all on public.habits, public.habit_checkins, public.goals,
  public.water_intake, public.priority_dismissals, public.quick_notes,
  public.linked_accounts, public.selected_calendar_ids
  to service_role;
grant all on private.linked_account_secrets to service_role;

create index if not exists habits_owner_email_idx on public.habits(owner_email);
create index if not exists habit_checkins_owner_email_idx on public.habit_checkins(owner_email);
create index if not exists water_intake_owner_date_idx
  on public.water_intake(owner_email, consumed_on, created_at desc);
create index if not exists goals_owner_email_idx on public.goals(owner_email);
create index if not exists priority_dismissals_owner_date_idx
  on public.priority_dismissals(owner_email, dismissed_on);
create index if not exists quick_notes_owner_email_idx on public.quick_notes(owner_email);
create index if not exists linked_accounts_owner_email_idx on public.linked_accounts(owner_email);
create index if not exists selected_calendar_ids_owner_email_idx on public.selected_calendar_ids(owner_email);
