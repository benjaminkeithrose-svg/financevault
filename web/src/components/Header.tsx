import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavMenuList } from "./NavMenu.js";
import { SearchResults } from "./SearchResults.js";
import { IconChevronLeft, IconClose, IconHome, IconLock, IconMenu, IconSearch } from "./icons.js";
import { lockApp } from "./LockGate.js";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/visualization": "Visualization",
  "/inbox": "Inbox",
  "/documents": "Documents",
  "/people": "People",
  "/entities": "Entities",
  "/search": "Search",
  "/properties": "Properties",
  "/commercial-properties/acquisition-model": "Acquisition Model",
  "/investments": "Investments",
  "/banking": "Banking",
  "/loans": "Loans",
  "/liabilities": "Liabilities",
  "/assets": "Assets",
  "/portfolio-plans": "Portfolio Plan",
  "/net-worth": "Net Worth",
  "/tax": "Tax",
  "/reports": "Reports",
  "/packs": "Document Packs",
  "/settings": "Settings",
};

// Singular label for a detail route (e.g. /people/:id) whose exact title
// (the record's name) isn't known to the header without an extra fetch —
// showing the section name is enough context alongside the back chevron.
const DETAIL_TITLES: Record<string, string> = {
  documents: "Document",
  people: "Person",
  entities: "Entity",
  properties: "Property",
  "commercial-properties": "Commercial Property",
  investments: "Investment Account",
  banking: "Bank Account",
  liabilities: "Liability",
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

  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const parent = getParent(location.pathname);
  const title = getTitle(location.pathname);

  return (
    <>
      <header className="app-header">
        {location.pathname !== "/" && (
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
            <div className="app-header-title">Financial Vault</div>
          </div>
          <div className="overlay-body">
            <NavMenuList onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
