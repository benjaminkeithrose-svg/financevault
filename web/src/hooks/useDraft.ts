import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Form state that survives leaving the screen. What's typed is kept in this
 * browser as a draft until the record is created or the form is cleared, so
 * going back (or being locked out by the idle timer) doesn't lose it.
 *
 * A form that's back to its starting values isn't a draft, so resetting the
 * form after a successful create discards the draft on its own.
 *
 * Don't use this for secret fields (tax file numbers, card numbers): drafts
 * are kept in the browser unencrypted.
 */
export function useDraft<T extends object>(key: string, initial: T) {
  const storageKey = `fv-draft:${key}`;
  const initialJson = useMemo(() => JSON.stringify(initial), [initial]);

  const [restored] = useState(() => readDraft(storageKey) !== null);
  const [value, setValue] = useState<T>(() => {
    const saved = readDraft(storageKey);
    // Fields added to a form since the draft was saved keep their defaults.
    return saved ? { ...initial, ...(saved as Partial<T>) } : initial;
  });
  const [showRestored, setShowRestored] = useState(restored);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const json = JSON.stringify(value);
    try {
      if (json === initialJson) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, json);
    } catch {
      // Storage can be unavailable (private window); the form still works.
    }
    if (json === initialJson) setShowRestored(false);
  }, [value, initialJson, storageKey]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setValue(JSON.parse(initialJson) as T);
    setShowRestored(false);
  }, [initialJson, storageKey]);

  const isDirty = JSON.stringify(value) !== initialJson;
  return [value, setValue, { restored: showRestored, isDirty, clear }] as const;
}

function readDraft(storageKey: string): unknown {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export type Draft = { restored: boolean; isDirty: boolean; clear: () => void };
