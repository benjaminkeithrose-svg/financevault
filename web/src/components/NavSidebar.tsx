import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
}

// Grouped per the "who owns it" architecture: People and Entities are the
// ownership layer; Assets/Liabilities are what they own and owe. Keeping
// this distinction visible in the nav, not just in the data model.
const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/visualization", label: "Visualization" },
      { to: "/inbox", label: "Inbox" },
      { to: "/documents", label: "Documents" },
    ],
  },
  { label: "People", items: [{ to: "/people", label: "People" }] },
  { label: "Entities", items: [{ to: "/entities", label: "Entities" }] },
  {
    label: "Assets",
    items: [
      { to: "/properties", label: "Properties" },
      { to: "/investments", label: "Investments" },
      { to: "/banking", label: "Banking" },
      { to: "/assets", label: "Assets" },
    ],
  },
  { label: "Liabilities", items: [{ to: "/loans", label: "Loans" }, { to: "/liabilities", label: "Liabilities" }] },
  {
    label: "",
    items: [
      { to: "/tax", label: "Tax" },
      { to: "/reports", label: "Reports" },
      { to: "/packs", label: "Document Packs" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

export function NavSidebar() {
  return (
    <nav className="sidebar">
      <h1>
        Financial Vault
        <span>Private · Local-first</span>
      </h1>
      {GROUPS.map((group, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          {group.label && (
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                padding: "8px 12px 4px",
              }}
            >
              {group.label}
            </div>
          )}
          {group.items.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.to === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              {s.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
