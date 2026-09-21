import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Command Center",
  description: "A focused daily dashboard for work and life."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
