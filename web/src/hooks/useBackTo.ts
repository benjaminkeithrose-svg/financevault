import { useEffect, useState } from "react";

/**
 * Lets a detail page tell the header's back button which list it belongs
 * to, when the address alone can't: a credit card and a car loan share
 * /liabilities/:id but live on different lists.
 */
let current: string | null = null;
const EVENT = "fv-back-to";

export function useBackTo(path: string | null) {
  useEffect(() => {
    current = path;
    window.dispatchEvent(new Event(EVENT));
    return () => {
      current = null;
      window.dispatchEvent(new Event(EVENT));
    };
  }, [path]);
}

export function useBackOverride(): string | null {
  const [value, setValue] = useState(current);
  useEffect(() => {
    const sync = () => setValue(current);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return value;
}
