export type AccountMode = "all" | "work" | "personal";
export type Scope = "work" | "personal";

export const priorities = [
  { id: 1, title: "Finish quarterly report", scope: "work" as Scope, done: true },
  { id: 2, title: "Call insurance company", scope: "personal" as Scope, done: true },
  { id: 3, title: "Review pull request", scope: "work" as Scope, done: true }
];

export const calendar = [
  { id: 1, time: "9:00 AM", title: "Team Meeting", scope: "work" as Scope, color: "bg-indigo-500" },
  { id: 2, time: "11:00 AM", title: "Doctor Appointment", scope: "personal" as Scope, color: "bg-emerald-500" },
  { id: 3, time: "2:00 PM", title: "Project Review", scope: "work" as Scope, color: "bg-amber-500" }
];

export const notes = [
  { id: 1, title: "Ideas", body: "Add a weekly planning view and saved filters.", scope: "personal" as Scope },
  { id: 2, title: "Meeting Reminders", body: "Bring the launch notes to the project review.", scope: "work" as Scope },
  { id: 3, title: "Links", body: "Supabase dashboard, GitHub repo, Vercel project.", scope: "work" as Scope }
];

export const initialHabits = [
  { id: 1, title: "Workout", done: true },
  { id: 2, title: "Read 20 mins", done: true },
  { id: 3, title: "Meditate", done: false }
];
