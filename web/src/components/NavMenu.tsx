import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
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
      { to: "/tree", label: "Asset tree" },
      { to: "/visualization", label: "Visualization" },
    ],
  },
  {
    label: "Documents",
    items: [
      { to: "/inbox", label: "To review" },
      { to: "/documents", label: "Documents" },
      { to: "/bulk-import", label: "Import a folder" },
      { to: "/email-import", label: "Import from Gmail" },
    ],
  },
  { label: "Who owns it", items: [{ to: "/people", label: "People & entities" }, { to: "/advisers", label: "Professional advisers" }] },
  // Each kind of asset or debt has one home — no catch-all list repeating them.
  {
    label: "Assets",
    items: [
      { to: "/properties", label: "Properties" },
      { to: "/vehicles", label: "Vehicles & boats" },
      { to: "/investments", label: "Investments" },
      { to: "/banking", label: "Bank accounts" },
      { to: "/super", label: "Super" },
      { to: "/assets", label: "Other assets" },
      { to: "/insurance", label: "Insurance" },
    ],
  },
  {
    label: "Liabilities",
    items: [
      { to: "/loans", label: "Property loans" },
      { to: "/vehicle-loans", label: "Vehicle & boat loans" },
      { to: "/credit-cards", label: "Credit cards" },
      { to: "/liabilities", label: "Personal & other" },
    ],
  },
  {
    label: "Plan & report",
    items: [
      { to: "/net-worth", label: "Net Worth" },
      { to: "/tax", label: "Tax" },
      { to: "/reports", label: "Reports" },
      { to: "/portfolio-plans", label: "Portfolio Plan" },
      { to: "/packs", label: "Document Packs" },
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
  return (
    <nav>
      {NAV_GROUPS.map((group, i) => (
        <div key={i}>
          {group.label && <div className="nav-group-label">{group.label}</div>}
          {group.items.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.to === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
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
