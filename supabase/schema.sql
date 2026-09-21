create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_per_week int not null default 7 check (target_per_week between 1 and 7),
  created_at timestamptz not null default now()
);

create table if not exists public.habit_checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_on date not null default current_date,
  unique (habit_id, completed_on)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  target_date date,
  created_at timestamptz not null default now()
);

alter table public.habits enable row level security;
alter table public.habit_checkins enable row level security;
alter table public.goals enable row level security;

create policy "Users manage own habits" on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own checkins" on public.habit_checkins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own goals" on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
