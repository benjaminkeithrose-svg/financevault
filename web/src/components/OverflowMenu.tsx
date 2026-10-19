import { useEffect, useRef, useState } from "react";
import { IconMore } from "./icons.js";

export interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

// A "⋯" menu for a card's secondary actions (PREFERENCES.md: "Secondary
// actions go in a ⋯ menu on the card, not a row of buttons"). Stops click
// propagation so it can sit inside a clickable item-card without triggering
// the card's own open action.
export function OverflowMenu({ items }: { items: OverflowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <div className="overflow-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="icon-btn"
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore />
      </button>
      {open && (
        <div className="overflow-menu-panel">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.danger ? "danger" : ""}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
