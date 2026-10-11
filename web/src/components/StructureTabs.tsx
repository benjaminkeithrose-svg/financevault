import { useEffect } from "react";
import { NavLink } from "react-router-dom";

/**
 * The asset tree and the diagram are two views of the same thing — who owns
 * what — so they share one menu entry, with tabs at the top to switch.
 * The menu entry opens whichever view was used last, so it's never an
 * extra click for someone who prefers the diagram.
 */
const LAST_KEY = "fv-structure-view";

export const STRUCTURE_ROUTES = ["/tree", "/visualization"];

export function lastStructureView(): string {
  try {
    const saved = localStorage.getItem(LAST_KEY);
    return saved && STRUCTURE_ROUTES.includes(saved) ? saved : "/tree";
  } catch {
    return "/tree";
  }
}

function remember(route: string) {
  try {
    localStorage.setItem(LAST_KEY, route);
  } catch {
    /* still works, just won't remember */
  }
}

export function StructureTabs({ current }: { current: "/tree" | "/visualization" }) {
  useEffect(() => remember(current), [current]);
  return (
    <div className="tabs" role="tablist" aria-label="View">
      <NavLink to="/tree" role="tab" aria-selected={current === "/tree"} className={current === "/tree" ? "tab active" : "tab"}>
        Asset tree
      </NavLink>
      <NavLink
        to="/visualization"
        role="tab"
        aria-selected={current === "/visualization"}
        className={current === "/visualization" ? "tab active" : "tab"}
      >
        Diagram
      </NavLink>
    </div>
  );
}
