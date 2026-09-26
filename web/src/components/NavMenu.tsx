import { NavLink, useLocation } from "react-router-dom";
import { lastStructureView, STRUCTURE_ROUTES } from "./StructureTabs.js";
import { FeatureId, useFeatures } from "../features.js";

interface NavItem {
  to: string;
  label: string;
  /** Hidden while this feature is switched off in Settings → Features. */
  feature?: FeatureId;
  /** Other routes that count as this entry (the old per-kind debt lists). */
  also?: string[];
}

// Grouped per the "who owns it" architecture: people (each also their own
// personal entity) and the trusts/companies/funds around them are the
// ownership layer; Assets/Liabilities are what they own and owe. Keeping
// this distinction visible in the nav, not just in the data model.
export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "",
    items: [
      { to: "/", label: "Dashboard" },
      // One entry for both views; tabs on the page switch between them.
      { to: "/tree", label: "Asset tree & diagram" },
    ],
  },
  {
    label: "Documents",
    items: [
      { to: "/inbox", label: "To review" },
      { to: "/documents", label: "Documents" },
      { to: "/bulk-import", label: "Import a folder", feature: "bulk-import" },
      { to: "/email-import", label: "Import from Gmail", feature: "gmail" },
    ],
  },
  // Professional advisers are a section at the foot of People & entities.
  { label: "Who owns it", items: [{ to: "/people", label: "People & entities", also: ["/advisers", "/entities"] }] },
  // Each kind of asset or debt has one home — no catch-all list repeating them.
  {
    label: "Assets",
    items: [
      { to: "/properties", label: "Properties" },
      { to: "/vehicles", label: "Vehicles & boats", feature: "vehicles" },
      { to: "/investments", label: "Investments", feature: "investments" },
      { to: "/banking", label: "Bank accounts" },
      { to: "/super", label: "Super", feature: "super" },
      { to: "/assets", label: "Other assets" },
      { to: "/insurance", label: "Insurance", feature: "insurance" },
    ],
  },
  {
    label: "Liabilities",
    items: [
      // Property loans, vehicle loans, cards and personal debts as sections of one page.
      { to: "/loans", label: "Loans & cards", also: ["/vehicle-loans", "/credit-cards", "/liabilities"] },
      { to: "/borrowing", label: "How much could I borrow?", feature: "borrowing" },
    ],
  },
  {
    label: "Plan & report",
    items: [
      { to: "/net-worth", label: "Net Worth" },
      { to: "/tax", label: "Tax" },
      { to: "/reports", label: "Reports" },
      { to: "/missing", label: "What's missing", feature: "expected" },
      { to: "/accountant-checklist", label: "Worth asking your accountant", feature: "accountant" },
      { to: "/structure-comparison", label: "Who should own it?", feature: "structure" },
      { to: "/portfolio-plans", label: "Portfolio Plan", feature: "portfolio-plan" },
      { to: "/packs", label: "Document Packs", feature: "packs" },
    ],
  },
  {
    label: "",
    items: [
      { to: "/settings", label: "Settings" },
      { to: "/help", label: "Help" },
    ],
  },
];

// The full list of sections, used inside the header's full-screen menu
// overlay (PREFERENCES.md: options that aren't needed constantly go behind
// a menu, not as a permanent on-screen control).
export function NavMenuList({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation();
  const features = useFeatures();
  return (
    <nav>
      {NAV_GROUPS.map((group, i) => (
        <div key={i}>
          {group.label && <div className="nav-group-label">{group.label}</div>}
          {group.items.filter((s) => !s.feature || features.on(s.feature)).map((s) => (
            <NavLink
              key={s.to}
              to={s.to === "/tree" ? lastStructureView() : s.to}
              end={s.to === "/"}
              className={({ isActive }) =>
                `nav-link${
                  isActive || (s.to === "/tree" && STRUCTURE_ROUTES.includes(pathname)) || s.also?.includes(pathname) ? " active" : ""
                }`
              }
              onClick={onNavigate}
            >
              {s.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
