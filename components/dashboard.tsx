"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { CalendarDays, Check, CheckCircle2, Circle, Inbox, ListChecks, LogOut, NotebookPen, Sparkles, Target, Zap } from "lucide-react";
import { initialHabits, notes, priorities, type AccountMode } from "@/lib/mock-data";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  isAllDay: boolean;
  scope: "work" | "personal";
  color: string;
};

function formatEventTime(event: CalendarEvent) {
  if (event.isAllDay) {
    return "All day";
  }

  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(event.start));
}

const filterScope = <T extends { scope: "work" | "personal" }>(items: T[], mode: AccountMode) =>
  mode === "all" ? items : items.filter((item) => item.scope === mode);

function Card({ title, icon, children, className = "" }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center gap-2 text-slate-900">{icon}<h2 className="text-base font-bold">{title}</h2></div>
      {children}
    </section>
  );
}

export default function Dashboard({ userName }: { userName: string }) {
  const [mode, setMode] = useState<AccountMode>("all");
  const [habits, setHabits] = useState(initialHabits);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [localDate, setLocalDate] = useState("Today");
  const [timeOfDay, setTimeOfDay] = useState("afternoon");
  const filteredPriorities = useMemo(() => filterScope(priorities, mode), [mode]);
  const filteredCalendar = useMemo(() => filterScope(calendar, mode), [calendar, mode]);
  const filteredNotes = useMemo(() => filterScope(notes, mode), [mode]);

  useEffect(() => {
    const loadCalendar = async () => {
      try {
        const response = await fetch("/api/dashboard");
        if (!response.ok) {
          throw new Error("Calendar request failed");
        }

        const data = (await response.json()) as { calendar: CalendarEvent[] };
        setCalendar(data.calendar);
      } finally {
        setCalendarLoading(false);
      }
    };

    void loadCalendar();
  }, []);

  useEffect(() => {
    const updateLocalTime = () => {
      const now = new Date();
      const hour = now.getHours();

      setLocalDate(new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now));
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
          <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">{localDate}</p><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Good {timeOfDay}, {userName}.</h1><p className="mt-1 text-sm text-slate-500">Here is what deserves your attention today.</p></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-2xl bg-slate-100 p-1" aria-label="Account filter">
              {["all", "work", "personal"].map((item) => <button key={item} onClick={() => setMode(item as AccountMode)} className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${mode === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{item}</button>)}
            </div>
            <button type="button" onClick={() => signOut()} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="mb-6 flex items-start gap-3 rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white shadow-lg shadow-indigo-200">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-bold">Daily brief</p><p className="mt-1 max-w-4xl text-sm leading-6 text-indigo-100">You have a focused morning and two work priorities already checked off. Protect the 90 minutes before Project Review for the quarterly report, then handle the insurance call before the office closes.</p></div>
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          <Card title="Today's Priorities" icon={<Target className="h-5 w-5 text-indigo-600" />} className="lg:col-span-5">
            <div className="space-y-3">{filteredPriorities.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3"><CheckCircle2 className="h-5 w-5 text-emerald-500" /><span className="flex-1 text-sm font-semibold">{item.title}</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-slate-400">{item.scope}</span></div>)}</div>
          </Card>

          <Card title="Calendar" icon={<CalendarDays className="h-5 w-5 text-indigo-600" />} className="lg:col-span-7">
            <div className="space-y-1">{calendarLoading ? <p className="py-3 text-sm text-slate-500">Loading calendar...</p> : filteredCalendar.length === 0 ? <p className="py-3 text-sm text-slate-500">No upcoming events.</p> : filteredCalendar.map((event) => <div key={event.id} className="grid grid-cols-[72px_12px_1fr] items-center gap-3 border-b border-slate-100 py-3 last:border-0"><span className="text-xs font-bold text-slate-500">{formatEventTime(event)}</span><span className={`h-2.5 w-2.5 rounded-full ${event.color}`} /><div><p className="text-sm font-semibold">{event.title}</p><p className="text-xs capitalize text-slate-400">{event.scope} calendar</p></div></div>)}</div>
          </Card>

          <Card title="Quick Notes" icon={<NotebookPen className="h-5 w-5 text-indigo-600" />} className="lg:col-span-5">
            <div className="space-y-3">{filteredNotes.map((note) => <article key={note.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">{note.title}</h3><span className="text-[10px] font-bold uppercase text-slate-400">{note.scope}</span></div><p className="mt-2 text-sm leading-5 text-slate-500">{note.body}</p></article>)}</div>
          </Card>

          <Card title="Habits" icon={<Zap className="h-5 w-5 text-indigo-600" />} className="lg:col-span-3">
            <div className="space-y-3">{habits.map((habit) => <button key={habit.id} onClick={() => setHabits((current) => current.map((h) => h.id === habit.id ? { ...h, done: !h.done } : h))} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-slate-50">{habit.done ? <Check className="h-5 w-5 rounded-md bg-emerald-500 p-1 text-white" /> : <Circle className="h-5 w-5 text-slate-300" />}<span className={`text-sm font-semibold ${habit.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{habit.title}</span></button>)}</div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(habits.filter((h) => h.done).length / habits.length) * 100}%` }} /></div>
          </Card>

          <Card title="Daily Metrics" icon={<ListChecks className="h-5 w-5 text-indigo-600" />} className="lg:col-span-4">
            <div className="grid gap-3"><Metric icon={<Inbox />} label="Inbox" value="12 unread" tone="bg-blue-50 text-blue-600" /><Metric icon={<ListChecks />} label="Tasks Due" value="3" tone="bg-amber-50 text-amber-600" /><Metric icon={<Zap />} label="Workouts This Week" value="4" tone="bg-emerald-50 text-emerald-600" /></div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><span className={`grid h-9 w-9 place-items-center rounded-xl [&>svg]:h-4 [&>svg]:w-4 ${tone}`}>{icon}</span><span className="flex-1 text-sm font-semibold text-slate-600">{label}</span><strong className="text-sm text-slate-900">{value}</strong></div>;
}
