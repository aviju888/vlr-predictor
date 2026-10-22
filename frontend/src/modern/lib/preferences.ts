"use client";

import { useSyncExternalStore } from "react";

/* ─────────────────────────────────────────────────────────
 * VLR PREFERENCES — tiny client store for app-wide toggles.
 * `sfx` persists per viewer; `xray` is per session.
 * ───────────────────────────────────────────────────────── */

export type ModernPrefs = { sfx: boolean; xray: boolean };

const SERVER: ModernPrefs = { sfx: false, xray: false };
let state: ModernPrefs = SERVER;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = { ...state, sfx: localStorage.getItem("vlr-modern:sfx") === "1" };
  } catch {
    // storage blocked
  }
}

function subscribe(fn: () => void) {
  load();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getModernPrefs(): ModernPrefs {
  load();
  return state;
}

export function setModernPref<K extends keyof ModernPrefs>(key: K, value: ModernPrefs[K]) {
  state = { ...state, [key]: value };
  if (key === "sfx") {
    try {
      localStorage.setItem("vlr-modern:sfx", value ? "1" : "0");
    } catch {
      // ignore
    }
  }
  listeners.forEach((l) => l());
}

export function useModernPrefs(): ModernPrefs {
  return useSyncExternalStore(subscribe, getModernPrefs, () => SERVER);
}
