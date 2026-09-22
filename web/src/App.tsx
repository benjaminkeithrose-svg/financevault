import { useEffect, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { NavSidebar } from "./components/NavSidebar.js";
import { api } from "./api/client.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Visualization } from "./pages/Visualization.js";
import { Inbox } from "./pages/Inbox.js";
import { Documents } from "./pages/Documents.js";
import { DocumentDetail } from "./pages/DocumentDetail.js";
import { Entities } from "./pages/Entities.js";
import { EntityDetail } from "./pages/EntityDetail.js";
import { People } from "./pages/People.js";
import { PersonDetail } from "./pages/PersonDetail.js";
import { Search } from "./pages/Search.js";
import { Settings } from "./pages/Settings.js";
import { Properties } from "./pages/Properties.js";
import { PropertyDetail } from "./pages/PropertyDetail.js";
import { CommercialPropertyDetail } from "./pages/CommercialPropertyDetail.js";
import { AcquisitionModel } from "./pages/AcquisitionModel.js";
import { Liabilities } from "./pages/Liabilities.js";
import { LiabilityDetail } from "./pages/LiabilityDetail.js";
import { Investments } from "./pages/Investments.js";
import { InvestmentAccountDetail } from "./pages/InvestmentAccountDetail.js";
import { Banking } from "./pages/Banking.js";
import { AccountDetail } from "./pages/AccountDetail.js";
import { Assets } from "./pages/Assets.js";
import { NetWorth } from "./pages/NetWorth.js";
import { Tax } from "./pages/Tax.js";
import { Reports } from "./pages/Reports.js";
import { Packs } from "./pages/Packs.js";

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

function Home() {
  const [landingPage, setLandingPage] = useState<string | null>(null);

  useEffect(() => {
    api.settings.get().then((s) => setLandingPage(s.defaultLandingPage));
  }, []);

  if (!landingPage) return null;
  return landingPage === "VISUALIZATION" ? <Visualization /> : <Dashboard />;
}

export default function App() {
  return (
    <div className="app-shell">
      <NavSidebar />
      <main className="main-content">
        <TopSearch />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/visualization" element={<Visualization />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/:id" element={<DocumentDetail />} />
          <Route path="/people" element={<People />} />
          <Route path="/people/:id" element={<PersonDetail />} />
          <Route path="/entities" element={<Entities />} />
          <Route path="/entities/:id" element={<EntityDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />
          <Route path="/commercial-properties/acquisition-model" element={<AcquisitionModel />} />
          <Route path="/commercial-properties/:id" element={<CommercialPropertyDetail />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/investments/:id" element={<InvestmentAccountDetail />} />
          <Route path="/banking" element={<Banking />} />
          <Route path="/banking/:id" element={<AccountDetail />} />
          <Route path="/loans" element={<Liabilities scope="loans" />} />
          <Route path="/liabilities" element={<Liabilities scope="all" />} />
          <Route path="/liabilities/:id" element={<LiabilityDetail />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/net-worth" element={<NetWorth />} />
          <Route path="/tax" element={<Tax />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/packs" element={<Packs />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
