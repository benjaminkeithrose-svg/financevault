import { useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { NavSidebar } from "./components/NavSidebar.js";
import { Placeholder } from "./components/Placeholder.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Inbox } from "./pages/Inbox.js";
import { Documents } from "./pages/Documents.js";
import { DocumentDetail } from "./pages/DocumentDetail.js";
import { Entities } from "./pages/Entities.js";
import { EntityDetail } from "./pages/EntityDetail.js";
import { Search } from "./pages/Search.js";
import { Settings } from "./pages/Settings.js";

function TopSearch() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      style={{ marginBottom: 20 }}
    >
      <input
        placeholder='Search everything — "insurance for investment properties in 2025-26"…'
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <NavSidebar />
      <main className="main-content">
        <TopSearch />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/:id" element={<DocumentDetail />} />
          <Route path="/entities" element={<Entities />} />
          <Route path="/entities/:id" element={<EntityDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/properties" element={<Placeholder title="Properties" stage="Stage 2" />} />
          <Route path="/investments" element={<Placeholder title="Investments" stage="Stage 2" />} />
          <Route path="/banking" element={<Placeholder title="Banking" stage="Stage 2" />} />
          <Route path="/loans" element={<Placeholder title="Loans" stage="Stage 2" />} />
          <Route path="/tax" element={<Placeholder title="Tax" stage="Stage 3" />} />
          <Route path="/assets" element={<Placeholder title="Assets" stage="Stage 2" />} />
          <Route path="/liabilities" element={<Placeholder title="Liabilities" stage="Stage 2" />} />
          <Route path="/reports" element={<Placeholder title="Reports" stage="Stage 3" />} />
          <Route path="/packs" element={<Placeholder title="Document Packs" stage="Stage 4" />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
