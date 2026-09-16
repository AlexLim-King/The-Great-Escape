import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Escape Room Missions",
  description: "Host and play escape-room-style mission hunts",
};

// Runs before first paint to set the color scheme from the saved preference
// (default: light), so there's no dark/light flash. "system" is resolved
// here against the OS setting. Mirrors the logic in ThemeToggle.tsx.
const COLOR_SCHEME_SCRIPT = `(function(){try{var p=localStorage.getItem('theme-pref')||'light';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.colorScheme=d?'dark':'light';r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The pre-paint script sets data-color-scheme / color-scheme on <html>
      // before React hydrates, so suppress the expected attribute mismatch.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_SCRIPT }} />
        <Header />
        {children}
      </body>
    </html>
  );
}
