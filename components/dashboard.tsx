"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Circle,
  Droplets,
  Inbox,
  ListChecks,
  LogOut,
  NotebookPen,
  Plus,
  Sparkles,
  Target,
  Undo2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
type AccountMode = "all" | "work" | "personal" | "family";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  isAllDay: boolean;
  scope: "work" | "personal" | "family";
  color: string;
};

type PriorityItem = {
  id: string | number;
  title: string;
  scope: "work" | "personal" | "family";
  done: boolean;
  source: "todo" | "planner" | "event" | "habit" | "goal" | "email";
  dueAt?: string;
};

type Goal = {
  id: string;
  title: string;
  status: "active" | "paused" | "completed";
  targetDate: string | null;
};

type Habit = {
  id: string;
  title: string;
  done: boolean;
  weeklyCompletions: number;
  currentStreak: number;
  targetPerWeek: number;
};

type WaterEntry = {
  id: string;
  amountOunces: number;
  createdAt: string;
};

type WaterSnapshot = {
  entries: WaterEntry[];
  totalOunces: number;
  goalOunces: number;
};

type NoteItem = {
  id: string;
  title: string;
  body: string;
  scope: "work" | "personal" | "family";
};

function formatEventDate(event: CalendarEvent) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(event.start));
}

function formatEventTime(event: CalendarEvent) {
  if (event.isAllDay) {
    return "All day";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(event.start));
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const filterScope = <T extends { scope: "work" | "personal" | "family" }>(
  items: T[],
  mode: AccountMode,
) => (mode === "all" ? items : items.filter((item) => item.scope === mode));

const prioritySourceLabels: Record<PriorityItem["source"], string> = {
  todo: "Overdue To Do",
  planner: "Planner",
  event: "Calendar",
  habit: "Habit",
  goal: "Goal",
  email: "Email",
};

function generateDailyBrief({
  priorities,
  calendar,
  habits,
}: {
  priorities: PriorityItem[];
  calendar: CalendarEvent[];
  habits: Habit[];
}) {
  const nextTask = priorities.find((item) => !item.done);
  const nextEvent = [...calendar]
    .sort((first, second) => first.start.localeCompare(second.start))
    .find((event) => new Date(event.start).getTime() > Date.now());
  const openHabit = habits.find((habit) => !habit.done);

  if (!nextTask && !nextEvent && !openHabit) {
    return "Your day is clear. Connect a calendar or task source to see a personalized brief.";
  }

  const parts: string[] = [];

  if (nextTask) {
    parts.push(`Your next priority is ${nextTask.title}.`);
  }

  if (nextEvent) {
    parts.push(
      `Your next event is ${nextEvent.title} at ${formatEventTime(nextEvent)}.`,
    );
  }

  if (openHabit) {
    parts.push(`Keep momentum by completing ${openHabit.title}.`);
  }

  return parts.join(" ");
}

function Card({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="mb-4 flex items-center gap-2 text-slate-900">
        {icon}
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Dashboard({ userName }: { userName: string }) {
  const [mode, setMode] = useState<AccountMode>("all");
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [priorityActionId, setPriorityActionId] = useState<string | number | null>(null);
  const [priorityError, setPriorityError] = useState("");
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [habitName, setHabitName] = useState("");
  const [habitSaving, setHabitSaving] = useState(false);
  const [habitError, setHabitError] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTargetDate, setGoalTargetDate] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState("");
  const [waterDate] = useState(() => localDateKey(new Date()));
  const [waterSnapshot, setWaterSnapshot] = useState<WaterSnapshot | null>(null);
  const [waterLoading, setWaterLoading] = useState(true);
  const [waterSaving, setWaterSaving] = useState(false);
  const [waterError, setWaterError] = useState("");
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [microsoftConnected, setMicrosoftConnected] = useState({
    work: false,
    personal: false,
  });
  const [localDate, setLocalDate] = useState("Today");
  const [timeOfDay, setTimeOfDay] = useState("afternoon");
  const filteredPriorities = useMemo(
    () => filterScope(priorities, mode),
    [priorities, mode],
  );
  const priorityGroups = [
    { scope: "work" as const, label: "Work" },
    { scope: "personal" as const, label: "Personal" },
    { scope: "family" as const, label: "Family" },
  ];
  const filteredCalendar = useMemo(
    () => filterScope(calendar, mode),
    [calendar, mode],
  );
  const filteredNotes = useMemo(() => filterScope(notes, mode), [notes, mode]);
  const dailyBrief = useMemo(
    () => generateDailyBrief({ priorities, calendar, habits }),
    [priorities, calendar, habits],
  );
  const filterOptions: { value: AccountMode; label: string; color: string }[] =
    [
      { value: "all", label: "All", color: "bg-slate-400" },
      { value: "work", label: "Work", color: "bg-blue-500" },
      { value: "personal", label: "Personal", color: "bg-purple-500" },
      { value: "family", label: "Family", color: "bg-green-500" },
    ];

  const refreshPriorities = async () => {
    try {
      const now = new Date();
      const params = new URLSearchParams({
        date: localDateKey(now),
        timezoneOffsetMinutes: String(now.getTimezoneOffset()),
      });
      const response = await fetch(`/api/dashboard?${params}`);
      if (!response.ok) return;
      const data = (await response.json()) as { priorities?: PriorityItem[] };
      setPriorities(data.priorities ?? []);
    } catch {
      return;
    }
  };

  useEffect(() => {
    const loadCalendar = async () => {
      try {
        const now = new Date();
        const params = new URLSearchParams({
          date: localDateKey(now),
          timezoneOffsetMinutes: String(now.getTimezoneOffset()),
        });
        const response = await fetch(`/api/dashboard?${params}`);
        if (!response.ok) {
          throw new Error("Calendar request failed");
        }

        const data = (await response.json()) as {
          calendar: CalendarEvent[];
          priorities?: PriorityItem[];
          notes?: NoteItem[];
          googleConnected?: boolean;
          microsoftConnected?: { work: boolean; personal: boolean };
        };
        setCalendar(data.calendar ?? []);
        if (data.priorities) setPriorities(data.priorities);
        setNotes(data.notes ?? []);
        setGoogleConnected(Boolean(data.googleConnected));
        setMicrosoftConnected(
          data.microsoftConnected ?? { work: false, personal: false },
        );
      } finally {
        setCalendarLoading(false);
      }
    };

    void loadCalendar();
  }, []);

  useEffect(() => {
    const loadHabits = async () => {
      try {
        const response = await fetch("/api/habits");
        if (!response.ok) throw new Error("Habit request failed");
        const data = (await response.json()) as { habits: Habit[] };
        setHabits(data.habits);
        setHabitError("");
      } catch {
        setHabitError("Connect Supabase to save habits.");
      }
    };

    void loadHabits();
  }, []);

  useEffect(() => {
    const loadGoals = async () => {
      try {
        const response = await fetch("/api/goals");
        if (!response.ok) throw new Error("Goal request failed");
        const data = (await response.json()) as { goals: Goal[] };
        setGoals(data.goals);
        setGoalError("");
      } catch {
        setGoalError("Connect Supabase to save goals.");
      }
    };

    void loadGoals();
  }, []);

  useEffect(() => {
    const loadWater = async () => {
      try {
        const response = await fetch(`/api/water?date=${waterDate}`);
        if (!response.ok) throw new Error("Water request failed");
        setWaterSnapshot((await response.json()) as WaterSnapshot);
        setWaterError("");
      } catch {
        setWaterError("Unable to load water. Check the Supabase water table setup.");
      } finally {
        setWaterLoading(false);
      }
    };

    void loadWater();
  }, [waterDate]);

  const toggleHabit = async (habit: Habit) => {
    setHabitError("");
    const previousHabits = habits;
    setHabits((current) =>
      current.map((item) =>
        item.id === habit.id
          ? {
              ...item,
              done: !item.done,
              weeklyCompletions: item.weeklyCompletions + (item.done ? -1 : 1),
              currentStreak: item.done
                ? Math.max(0, item.currentStreak - 1)
                : item.currentStreak + 1,
            }
          : item,
      ),
    );

    try {
      const response = await fetch("/api/habits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitId: habit.id, done: !habit.done }),
      });
      if (!response.ok) throw new Error("Habit update failed");
      const data = (await response.json()) as { habits: Habit[] };
      setHabits(data.habits);
      await refreshPriorities();
    } catch {
      setHabits(previousHabits);
      setHabitError("Unable to update habit.");
    }
  };

  const addHabit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!habitName.trim()) return;

    setHabitSaving(true);
    setHabitError("");
    try {
      const response = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: habitName, targetPerWeek: 7 }),
      });
      if (!response.ok) throw new Error("Habit creation failed");
      const data = (await response.json()) as { habits: Habit[] };
      setHabits(data.habits);
      await refreshPriorities();
      setHabitName("");
    } catch {
      setHabitError("Unable to add habit.");
    } finally {
      setHabitSaving(false);
    }
  };

  const addGoal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!goalTitle.trim()) return;

    setGoalSaving(true);
    setGoalError("");
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: goalTitle, targetDate: goalTargetDate || null }),
      });
      if (!response.ok) throw new Error("Goal creation failed");
      const data = (await response.json()) as { goals: Goal[] };
      setGoals(data.goals);
      await refreshPriorities();
      setGoalTitle("");
      setGoalTargetDate("");
    } catch {
      setGoalError("Unable to add goal.");
    } finally {
      setGoalSaving(false);
    }
  };

  const toggleGoal = async (goal: Goal) => {
    setGoalError("");
    try {
      const response = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId: goal.id,
          status: goal.status === "completed" ? "active" : "completed",
        }),
      });
      if (!response.ok) throw new Error("Goal update failed");
      const data = (await response.json()) as { goals: Goal[] };
      setGoals(data.goals);
      await refreshPriorities();
    } catch {
      setGoalError("Unable to update goal.");
    }
  };

  const handlePriorityAction = async (item: PriorityItem) => {
    setPriorityActionId(item.id);
    setPriorityError("");
    try {
      if (item.source === "habit") {
        const response = await fetch("/api/habits", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            habitId: String(item.id).slice("habit-".length),
            done: true,
          }),
        });
        if (!response.ok) throw new Error("Habit completion failed");
        const data = (await response.json()) as { habits: Habit[] };
        setHabits(data.habits);
        await refreshPriorities();
      } else if (item.source === "goal") {
        const response = await fetch("/api/goals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goalId: String(item.id).slice("goal-".length),
            status: "completed",
          }),
        });
        if (!response.ok) throw new Error("Goal completion failed");
        const data = (await response.json()) as { goals: Goal[] };
        setGoals(data.goals);
        await refreshPriorities();
      } else {
        const response = await fetch("/api/priorities/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priorityId: item.id,
            date: localDateKey(new Date()),
          }),
        });
        if (!response.ok) throw new Error("Priority dismissal failed");
        setPriorities((current) => current.filter((priority) => priority.id !== item.id));
      }
    } catch {
      setPriorityError("Unable to update this priority.");
    } finally {
      setPriorityActionId(null);
    }
  };

  const addWater = async (amountOunces: number) => {
    if (!waterDate || waterSaving) return;

    setWaterSaving(true);
    setWaterError("");
    try {
      const response = await fetch("/api/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: waterDate, amountOunces }),
      });
      if (!response.ok) throw new Error("Water update failed");
      setWaterSnapshot((await response.json()) as WaterSnapshot);
    } catch {
      setWaterError("Unable to save water intake.");
    } finally {
      setWaterSaving(false);
    }
  };

  const undoLastWater = async () => {
    const lastEntry = waterSnapshot?.entries[0];
    if (!waterDate || !lastEntry || waterSaving) return;

    setWaterSaving(true);
    setWaterError("");
    try {
      const response = await fetch("/api/water", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: waterDate, entryId: lastEntry.id }),
      });
      if (!response.ok) throw new Error("Water undo failed");
      setWaterSnapshot((await response.json()) as WaterSnapshot);
    } catch {
      setWaterError("Unable to undo the last water entry.");
    } finally {
      setWaterSaving(false);
    }
  };

  useEffect(() => {
    const updateLocalTime = () => {
      const now = new Date();
      const hour = now.getHours();

      setLocalDate(
        new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(now),
      );
      setTimeOfDay(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");
    };

    updateLocalTime();
    const interval = window.setInterval(updateLocalTime, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
              {localDate}
            </p>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Good {timeOfDay}, {userName}.
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Here is what deserves your attention today.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div
              className="flex rounded-2xl bg-slate-100 p-1"
              aria-label="Account filter"
            >
              {filterOptions.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setMode(item.value)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === item.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {item.value !== "all" && (
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  )}
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/api/microsoft/connect?slot=work"
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                title="Connect work Microsoft calendar"
              >
                <BriefcaseBusiness className="h-4 w-4" />
                <span>
                  {microsoftConnected.work ? "Reconnect work" : "Connect work"}
                </span>
              </a>
              <a
                href="/api/microsoft/connect?slot=personal"
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                title="Connect personal Microsoft calendar"
              >
                <UserRound className="h-4 w-4" />
                <span>
                  {microsoftConnected.personal
                    ? "Reconnect personal"
                    : "Connect personal"}
                </span>
              </a>
              <a
                href="/api/google/connect"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                {googleConnected ? "Reconnect Google" : "Connect Google"}
              </a>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="mb-6 flex items-start gap-3 rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white shadow-lg shadow-indigo-200">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Daily brief</p>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-indigo-100">
              {dailyBrief}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          <Card
            title="Today's Priorities"
            icon={<Target className="h-5 w-5 text-indigo-600" />}
            className="lg:col-span-5"
          >
            <div className="space-y-3">
              {priorityGroups.map((group) => {
                const groupItems = (
                  filteredPriorities as PriorityItem[]
                ).filter((item) => item.scope === group.scope);
                if (groupItems.length === 0) return null;

                return (
                  <div key={group.scope}>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                      {group.label}
                    </h3>
                    <div className="space-y-2">
                      {groupItems.map((item) => {
                        const canComplete =
                          item.source === "habit" || item.source === "goal";
                        const actionLabel = canComplete
                          ? `Complete ${prioritySourceLabels[item.source].toLowerCase()}`
                          : `Dismiss ${prioritySourceLabels[item.source].toLowerCase()}`;

                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3"
                          >
                            <button
                              type="button"
                              onClick={() => void handlePriorityAction(item)}
                              disabled={priorityActionId === item.id}
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition disabled:cursor-wait disabled:opacity-50 ${canComplete ? "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" : "text-slate-400 hover:bg-rose-50 hover:text-rose-600"}`}
                              aria-label={`${actionLabel}: ${item.title}`}
                              title={`${actionLabel}: ${item.title}`}
                            >
                              {canComplete ? (
                                <Circle className="h-5 w-5" />
                              ) : (
                                <X className="h-5 w-5" />
                              )}
                            </button>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-700">
                                {item.title}
                              </span>
                              <span className="mt-1 block text-[10px] font-medium uppercase text-slate-400">
                                {prioritySourceLabels[item.source]}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {filteredPriorities.length === 0 && (
                <p className="py-3 text-sm text-slate-500">
                  No priorities today.
                </p>
              )}
              {priorityError && (
                <p className="text-xs text-rose-600" role="status">
                  {priorityError}
                </p>
              )}
            </div>
          </Card>

          <Card
            title="Calendar"
            icon={<CalendarDays className="h-5 w-5 text-indigo-600" />}
            className="lg:col-span-7"
          >
            <div className="max-h-72 space-y-1 overflow-y-auto pr-2">
              {calendarLoading ? (
                <p className="py-3 text-sm text-slate-500">
                  Loading calendar...
                </p>
              ) : filteredCalendar.length === 0 ? (
                <p className="py-3 text-sm text-slate-500">
                  No upcoming events.
                </p>
              ) : (
                filteredCalendar.map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-[96px_12px_1fr] items-center gap-3 border-b border-slate-100 py-3 last:border-0"
                  >
                    <div className="text-xs font-bold text-slate-500">
                      <div>{formatEventDate(event)}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                        {formatEventTime(event)}
                      </div>
                    </div>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${event.color}`}
                    />
                    <div>
                      <p className="text-sm font-semibold">{event.title}</p>
                      <p className="text-xs capitalize text-slate-400">
                        {event.scope} calendar
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card
            title="Quick Notes"
            icon={<NotebookPen className="h-5 w-5 text-indigo-600" />}
            className="lg:col-span-5"
          >
            <div className="space-y-3">
              {filteredNotes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-2xl border border-slate-100 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{note.title}</h3>
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      {note.scope}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-500">
                    {note.body}
                  </p>
                </article>
              ))}
            </div>
          </Card>

          <Card
            title="Habits"
            icon={<Zap className="h-5 w-5 text-indigo-600" />}
            className="lg:col-span-3"
          >
            <form onSubmit={addHabit} className="mb-4 flex gap-2">
              <input
                value={habitName}
                onChange={(event) => setHabitName(event.target.value)}
                placeholder="Add a habit"
                maxLength={80}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                aria-label="New habit name"
              />
              <button
                type="submit"
                disabled={habitSaving || !habitName.trim()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Add habit"
                title="Add habit"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
            <div className="space-y-3">
              {habits.map((habit) => (
                <button
                  key={habit.id}
                  onClick={() => void toggleHabit(habit)}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-slate-50"
                >
                  {habit.done ? (
                    <Check className="h-5 w-5 rounded-md bg-emerald-500 p-1 text-white" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-300" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-semibold ${habit.done ? "text-slate-400 line-through" : "text-slate-700"}`}
                    >
                      {habit.title}
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {habit.weeklyCompletions}/{habit.targetPerWeek} this week
                      · {habit.currentStreak} day streak
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {habitError && (
              <p className="mt-3 text-xs text-rose-600">{habitError}</p>
            )}
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${habits.length ? (habits.reduce((total, habit) => total + habit.weeklyCompletions, 0) / (habits.reduce((total, habit) => total + habit.targetPerWeek, 0) || 1)) * 100 : 0}%`,
                }}
              />
            </div>
          </Card>

          <Card
            title="Water"
            icon={<Droplets className="h-5 w-5 text-sky-600" />}
            className="lg:col-span-4"
          >
            {waterLoading ? (
              <p className="py-3 text-sm text-slate-500">Loading water intake...</p>
            ) : waterSnapshot ? (
              <>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-2xl font-bold text-slate-900">
                    {waterSnapshot.totalOunces}
                    <span className="ml-1 text-sm font-medium text-slate-400">
                      / {waterSnapshot.goalOunces} fl oz
                    </span>
                  </p>
                  <span className="text-sm font-semibold text-sky-700">
                    {Math.round(
                      (waterSnapshot.totalOunces / waterSnapshot.goalOunces) * 100,
                    )}%
                  </span>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label="Daily water intake"
                  aria-valuemin={0}
                  aria-valuemax={waterSnapshot.goalOunces}
                  aria-valuenow={Math.min(
                    waterSnapshot.totalOunces,
                    waterSnapshot.goalOunces,
                  )}
                >
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all"
                    style={{
                      width: `${Math.min(100, (waterSnapshot.totalOunces / waterSnapshot.goalOunces) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[8, 16].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => void addWater(amount)}
                      disabled={waterSaving || !waterSnapshot}
                      className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      +{amount} oz
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex min-h-6 items-center justify-between gap-2">
                  {waterError ? (
                    <p className="text-xs text-rose-600" role="status">
                      {waterError}
                    </p>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => void undoLastWater()}
                    disabled={waterSaving || waterSnapshot.entries.length === 0}
                    className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Undo the most recent entry"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo last
                  </button>
                </div>
              </>
            ) : (
              <p className="py-3 text-sm text-rose-600" role="status">
                {waterError || "Water intake is unavailable."}
              </p>
            )}
          </Card>

          <Card
            title="Goals"
            icon={<Target className="h-5 w-5 text-indigo-600" />}
            className="lg:col-span-4"
          >
            <form onSubmit={addGoal} className="mb-4 space-y-2">
              <input
                value={goalTitle}
                onChange={(event) => setGoalTitle(event.target.value)}
                placeholder="Add a goal"
                maxLength={120}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                aria-label="New goal title"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={goalTargetDate}
                  onChange={(event) => setGoalTargetDate(event.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  aria-label="Goal target date"
                />
                <button
                  type="submit"
                  disabled={goalSaving || !goalTitle.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Add goal"
                  title="Add goal"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </form>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {goals.map((goal) => (
                <div key={goal.id} className="flex items-start gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => void toggleGoal(goal)}
                    className="mt-0.5 shrink-0"
                    aria-label={
                      goal.status === "completed"
                        ? `Reopen ${goal.title}`
                        : `Complete ${goal.title}`
                    }
                    title={goal.status === "completed" ? "Reopen goal" : "Complete goal"}
                  >
                    {goal.status === "completed" ? (
                      <Check className="h-5 w-5 rounded-md bg-emerald-500 p-1 text-white" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300" />
                    )}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-semibold ${goal.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}
                    >
                      {goal.title}
                    </span>
                    {goal.targetDate && (
                      <span className="mt-1 block text-[11px] text-slate-400">
                        Target {goal.targetDate}
                      </span>
                    )}
                  </span>
                </div>
              ))}
              {goals.length === 0 && !goalError && (
                <p className="py-2 text-sm text-slate-500">No goals yet.</p>
              )}
            </div>
            {goalError && <p className="mt-3 text-xs text-rose-600">{goalError}</p>}
          </Card>

          <Card
            title="Daily Metrics"
            icon={<ListChecks className="h-5 w-5 text-indigo-600" />}
            className="lg:col-span-4"
          >
            <div className="grid gap-3">
              <Metric
                icon={<Inbox />}
                label="Inbox"
                value="12 unread"
                tone="bg-blue-50 text-blue-600"
              />
              <Metric
                icon={<ListChecks />}
                label="Tasks Due"
                value="3"
                tone="bg-amber-50 text-amber-600"
              />
              <Metric
                icon={<Zap />}
                label="Workouts This Week"
                value="4"
                tone="bg-emerald-50 text-emerald-600"
              />
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl [&>svg]:h-4 [&>svg]:w-4 ${tone}`}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm font-semibold text-slate-600">
        {label}
      </span>
      <strong className="text-sm text-slate-900">{value}</strong>
    </div>
  );
}
