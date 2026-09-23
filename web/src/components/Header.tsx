import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavMenuList } from "./NavMenu.js";
import { SearchResults } from "./SearchResults.js";
import { IconChevronLeft, IconClose, IconHome, IconLock, IconMenu, IconPin, IconSearch } from "./icons.js";
import { usePinnedMenu } from "../hooks/usePinnedMenu.js";
import { useBackOverride } from "../hooks/useBackTo.js";
import { lockApp } from "./LockGate.js";
import { KeyholeMark } from "./KeyholeMark.js";
import { ThemePicker } from "./ThemePicker.js";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/visualization": "Asset Tree",
  "/tree": "Asset Tree",
  "/inbox": "To Review",
  "/documents": "Documents",
  "/bulk-import": "Import a Folder",
  "/email-import": "Import from Gmail",
  "/people": "People & Entities",
  "/entities": "People & Entities",
  "/search": "Search",
  "/properties": "Properties",
  "/commercial-properties/acquisition-model": "Acquisition Model",
  "/vehicles": "Vehicles & Boats",
  "/investments": "Investments",
  "/banking": "Bank Accounts",
  "/super": "Super",
  "/assets": "Other Assets",
  "/insurance": "Insurance",
  "/advisers": "Professional Advisers",
  "/loans": "Property Loans",
  "/vehicle-loans": "Vehicle & Boat Loans",
  "/credit-cards": "Credit Cards",
  "/liabilities": "Personal & Other Debts",
  "/portfolio-plans": "Portfolio Plan",
  "/net-worth": "Net Worth",
  "/tax": "Tax",
  "/reports": "Reports",
  "/packs": "Document Packs",
  "/settings": "Settings",
  "/help": "Help",
};

// Singular label for a detail route (e.g. /people/:id) whose exact title
// (the record's name) isn't known to the header without an extra fetch —
// showing the section name is enough context alongside the back chevron.
const DETAIL_TITLES: Record<string, string> = {
  documents: "Document",
  people: "Person",
  entities: "Entity",
  properties: "Property",
  insurance: "Insurance Policy",
  "commercial-properties": "Commercial Property",
  investments: "Investment Account",
  banking: "Bank Account",
  liabilities: "Debt",
  assets: "Asset",
  "bulk-import": "Bulk Import",
  "portfolio-plans": "Portfolio Plan",
};

function getTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const segment = pathname.split("/").filter(Boolean)[0];
  return DETAIL_TITLES[segment] || "Financial Vault";
}

// Back goes up one level in the app's structure, not through browser
// history (PREFERENCES.md). Detail routes go up to their list page;
// commercial property routes are reached via /properties, which has no
// list route of its own.
function getParent(pathname: string): string | null {
  if (pathname === "/") return null;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return "/";
  if (segments[0] === "commercial-properties") return "/properties";
  return `/${segments[0]}`;
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = usePinnedMenu();

  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // "/assets/" and "/assets" are the same page.
  const pathname = location.pathname.length > 1 ? location.pathname.replace(/\/+$/, "") : location.pathname;
  const backOverride = useBackOverride();
  const parent = backOverride ?? getParent(pathname);
  const title = getTitle(pathname);

  return (
    <>
      <header className="app-header">
        {pathname !== "/" && (
          <button className="icon-btn" aria-label="Home" onClick={() => navigate("/")}>
            <IconHome />
          </button>
        )}
        {parent !== null && (
          <button className="icon-btn" aria-label="Back" onClick={() => navigate(parent)}>
            <IconChevronLeft />
          </button>
        )}
        <div className="app-header-title">{title}</div>
        <button className="icon-btn" aria-label="Search" onClick={() => setSearchOpen(true)}>
          <IconSearch />
        </button>
        <button className="icon-btn" aria-label="Lock" title="Lock Financial Vault" onClick={lockApp}>
          <IconLock />
        </button>
        <button className="icon-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          <IconMenu />
        </button>
      </header>

      {searchOpen && (
        <div className="overlay">
          <div className="overlay-header">
            <button className="icon-btn" aria-label="Close search" onClick={() => setSearchOpen(false)}>
              <IconClose />
            </button>
            <input
              autoFocus
              placeholder='Search everything — "insurance for investment properties in 2025-26"…'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="overlay-body">
            <SearchResults q={query} />
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="overlay">
          <div className="overlay-header">
            <button className="icon-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
              <IconClose />
            </button>
            <div className="app-header-title brand">
              <KeyholeMark size={28} />
              Financial Vault
            </div>
            {/* Docking needs room beside the page, so it's offered on wider screens only. */}
            <button
              className="btn secondary pin-toggle"
              onClick={() => {
                setPinned(!pinned);
                setMenuOpen(false);
              }}
            >
              <IconPin /> {pinned ? "Unpin" : "Pin to side"}
            </button>
          </div>
          <div className="overlay-body">
            <NavMenuList onNavigate={() => setMenuOpen(false)} />
            <div className="menu-look">
              <div className="nav-group-label">Look and feel</div>
              <ThemePicker compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
