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
      { to: "/visualization", label: "Visualization" },
      { to: "/inbox", label: "Inbox" },
      { to: "/documents", label: "Documents" },
      { to: "/bulk-import", label: "Bulk import" },
      { to: "/email-import", label: "Email import" },
    ],
  },
  { label: "Who owns it", items: [{ to: "/people", label: "People & entities" }] },
  {
    label: "Assets",
    items: [
      { to: "/properties", label: "Properties" },
      { to: "/investments", label: "Investments" },
      { to: "/banking", label: "Banking" },
      { to: "/vehicles", label: "Vehicles & boats" },
      { to: "/assets", label: "Assets" },
      { to: "/portfolio-plans", label: "Portfolio Plan" },
    ],
  },
  { label: "Liabilities", items: [{ to: "/loans", label: "Loans" }, { to: "/liabilities", label: "Liabilities" }] },
  {
    label: "",
    items: [
      { to: "/net-worth", label: "Net Worth" },
      { to: "/tax", label: "Tax" },
      { to: "/reports", label: "Reports" },
      { to: "/packs", label: "Document Packs" },
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
