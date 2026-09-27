import { useEffect, useState } from "react";

/**
 * The path you came down: Dashboard › Toyota Prado › Comprehensive policy ›
 * Policy schedule. The header's back arrow goes up this path one level at a
 * time — back to the Prado from its policy, whichever list the policy is
 * also on — and the breadcrumb bar shows it. Going back to a page already on
 * the path shortens the path to it; the menu, the home button and search
 * start a new path. Kept for this browser tab only.
 */

export interface Crumb {
  path: string;
  title: string;
}

const KEY = "fv-trail";
const EVENT = "fv-trail-change";
const MAX = 10;

function load(): Crumb[] {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

let trail: Crumb[] = load();
let fresh = false;

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    /* only for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The next page starts a new path (the menu, home, search). */
export function startNewTrail() {
  fresh = true;
}

/** Called by the header on every change of page. */
export function arrive(path: string, title: string) {
  const at = trail.findIndex((c) => c.path === path);
  if (fresh || trail.length === 0) {
    trail = [{ path, title }];
  } else if (at >= 0) {
    trail = trail.slice(0, at + 1);
  } else {
    trail = [...trail, { path, title }].slice(-MAX);
  }
  fresh = false;
  save();
}

/** The page one level up the path you came down, if there is one. */
export function trailParent(path: string): string | null {
  const at = trail.findIndex((c) => c.path === path);
  return at > 0 ? trail[at - 1].path : null;
}

export function useTrail(): Crumb[] {
  const [value, setValue] = useState(trail);
  useEffect(() => {
    const sync = () => setValue(trail);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return value;
}

/**
 * A page names itself on the path ("Toyota Prado" rather than "Asset") once
 * its record has loaded.
 */
export function useTrailTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const path = window.location.pathname;
    const at = trail.findIndex((c) => c.path === path);
    if (at < 0 || trail[at].title === title) return;
    trail = trail.map((c, i) => (i === at ? { ...c, title } : c));
    save();
  }, [title]);
}
