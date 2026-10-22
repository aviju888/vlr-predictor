"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { setModernPref, useModernPrefs } from "@/modern/lib/preferences";

export function ModernHeader() {
  const [dark, setDark] = useState(false);
  const { sfx } = useModernPrefs();

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("vlr-modern:theme"); } catch { /* storage blocked */ }
    const next = stored === "dark" || (!stored && matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("vlr-modern:theme", next ? "dark" : "light"); } catch { /* storage blocked */ }
  }

  return (
    <header className="border-b border-line">
      <nav aria-label="Main navigation" className="mx-auto flex min-h-14 max-w-[1240px] flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
        <a href="/" className="mr-auto text-sm font-semibold">VLR Predictor</a>
        <a href="/classic" className="rounded-control px-2 py-2 text-xs text-ink-2 hover:bg-hover">Classic · live predictions</a>
        <button type="button" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={toggleTheme} className="rounded-control p-2 hover:bg-hover">
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button type="button" aria-label={sfx ? "Turn sound off" : "Turn sound on"} aria-pressed={sfx} onClick={() => setModernPref("sfx", !sfx)} className="rounded-control p-2 hover:bg-hover">
          {sfx ? <SpeakerHigh size={17} /> : <SpeakerSlash size={17} />}
        </button>
      </nav>
    </header>
  );
}
