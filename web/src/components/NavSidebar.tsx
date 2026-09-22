import { NavLink } from "react-router-dom";

const SECTIONS: Array<{ to: string; label: string }> = [
  { to: "/", label: "Dashboard" },
  { to: "/inbox", label: "Inbox" },
  { to: "/documents", label: "Documents" },
  { to: "/entities", label: "Entities" },
  { to: "/properties", label: "Properties" },
  { to: "/investments", label: "Investments" },
  { to: "/banking", label: "Banking" },
  { to: "/loans", label: "Loans" },
  { to: "/tax", label: "Tax" },
  { to: "/assets", label: "Assets" },
  { to: "/liabilities", label: "Liabilities" },
  { to: "/reports", label: "Reports" },
  { to: "/packs", label: "Document Packs" },
  { to: "/settings", label: "Settings" },
];

export function NavSidebar() {
  return (
    <nav className="sidebar">
      <h1>
        Financial Vault
        <span>Private · Local-first</span>
      </h1>
      {SECTIONS.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          end={s.to === "/"}
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          {s.label}
        </NavLink>
      ))}
    </nav>
  );
}
