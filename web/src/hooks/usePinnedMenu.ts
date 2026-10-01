import { useEffect, useState } from "react";

const KEY = "fv-menu-pinned";
const EVENT = "fv-menu-pinned-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Whether the menu is pinned down the side. A per-computer preference, so it
 * lives in this browser; the header and the page layout both follow it.
 */
export function usePinnedMenu() {
  const [pinned, setPinnedState] = useState(read);

  useEffect(() => {
    const sync = () => setPinnedState(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  function setPinned(value: boolean) {
    try {
      localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      /* ignore — still works for this visit */
    }
    setPinnedState(value);
    window.dispatchEvent(new Event(EVENT));
  }

  return [pinned, setPinned] as const;
}
