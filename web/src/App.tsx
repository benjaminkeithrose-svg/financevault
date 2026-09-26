import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header.js";
import { api } from "./api/client.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Visualization } from "./pages/Visualization.js";
import { Inbox } from "./pages/Inbox.js";
import { Documents } from "./pages/Documents.js";
import { DocumentDetail } from "./pages/DocumentDetail.js";
import { EntityDetail } from "./pages/EntityDetail.js";
import { PeopleAndEntities } from "./pages/PeopleAndEntities.js";
import { PersonDetail } from "./pages/PersonDetail.js";
import { Search } from "./pages/Search.js";
import { Settings } from "./pages/Settings.js";
import { Properties } from "./pages/Properties.js";
import { PropertyDetail } from "./pages/PropertyDetail.js";
import { CommercialPropertyDetail } from "./pages/CommercialPropertyDetail.js";
import { AcquisitionModel } from "./pages/AcquisitionModel.js";
import { LiabilityDetail } from "./pages/LiabilityDetail.js";
import { Investments } from "./pages/Investments.js";
import { InvestmentAccountDetail } from "./pages/InvestmentAccountDetail.js";
import { Banking } from "./pages/Banking.js";
import { AccountDetail } from "./pages/AccountDetail.js";
import { Assets } from "./pages/Assets.js";
import { AssetDetail } from "./pages/AssetDetail.js";
import { NetWorth } from "./pages/NetWorth.js";
import { Borrowing } from "./pages/Borrowing.js";
import { AccountantChecklist } from "./pages/AccountantChecklist.js";
import { StructureComparison } from "./pages/StructureComparison.js";
import { CarCompare } from "./pages/CarCompare.js";
import { Tax } from "./pages/Tax.js";
import { Reports } from "./pages/Reports.js";
import { Packs } from "./pages/Packs.js";
import { EmailImport } from "./pages/EmailImport.js";
import { BulkImport } from "./pages/BulkImport.js";
import { PortfolioPlans } from "./pages/PortfolioPlans.js";
import { PortfolioPlanDetail } from "./pages/PortfolioPlanDetail.js";
import { LoadFailed } from "./components/LoadFailed.js";
import { NavMenuList } from "./components/NavMenu.js";
import { ThemePicker } from "./components/ThemePicker.js";
import { IconPin } from "./components/icons.js";
import { usePinnedMenu } from "./hooks/usePinnedMenu.js";
import { Help } from "./pages/Help.js";
import { Insurance, InsuranceDetail } from "./pages/InsuranceDetail.js";
import { AssetTree } from "./pages/AssetTree.js";
import { LoansAndCards } from "./pages/LoansAndCards.js";
import { FeatureGate } from "./components/FeatureGate.js";
import { FeatureId } from "./features.js";
import { Missing } from "./pages/Missing.js";

const gate = (feature: FeatureId, page: JSX.Element) => <FeatureGate feature={feature}>{page}</FeatureGate>;

function Home() {
  const [landingPage, setLandingPage] = useState<string | null>(null);

  useEffect(() => {
    api.settings.get().then((s) => setLandingPage(s.defaultLandingPage));
  }, []);

  if (!landingPage) return null;
  return landingPage === "VISUALIZATION" ? <Visualization /> : <Dashboard />;
}

export default function App() {
  const [pinned, setPinned] = usePinnedMenu();
  return (
    <div className={`app-shell${pinned ? " menu-pinned" : ""}`}>
      <Header />
      {pinned && (
        <aside className="side-nav" aria-label="Menu">
          <button className="btn secondary side-nav-unpin" onClick={() => setPinned(false)}>
            <IconPin /> Unpin
          </button>
          <NavMenuList onNavigate={() => {}} />
          <div className="menu-look">
            <div className="nav-group-label">Look and feel</div>
            <ThemePicker compact />
          </div>
        </aside>
      )}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/visualization" element={<Visualization />} />
          <Route path="/tree" element={<AssetTree />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/:id" element={<DocumentDetail />} />
          <Route path="/people" element={<PeopleAndEntities />} />
          <Route path="/people/:id" element={<PersonDetail />} />
          <Route path="/people/:id/car" element={gate("payg", <CarCompare />)} />
          <Route path="/entities" element={<PeopleAndEntities />} />
          <Route path="/entities/:id" element={<EntityDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />
          <Route path="/commercial-properties/acquisition-model" element={gate("commercial", <AcquisitionModel />)} />
          <Route path="/commercial-properties/:id" element={gate("commercial", <CommercialPropertyDetail />)} />
          <Route path="/investments" element={gate("investments", <Investments />)} />
          <Route path="/investments/:id" element={gate("investments", <InvestmentAccountDetail />)} />
          <Route path="/banking" element={<Banking />} />
          <Route path="/banking/:id" element={<AccountDetail />} />
          <Route path="/loans" element={<LoansAndCards key="property" />} />
          <Route path="/vehicle-loans" element={<LoansAndCards key="vehicle" focus="vehicle" />} />
          <Route path="/credit-cards" element={<LoansAndCards key="cards" focus="cards" />} />
          <Route path="/liabilities" element={<LoansAndCards key="other" focus="other" />} />
          <Route path="/liabilities/:id" element={<LiabilityDetail />} />
          <Route path="/assets" element={<Assets key="other" list="OTHER" />} />
          <Route path="/super" element={gate("super", <Assets key="super" list="SUPER" />)} />
          <Route path="/vehicles" element={gate("vehicles", <Assets key="vehicles" list="VEHICLE" />)} />
          <Route path="/assets/:id" element={<AssetDetail />} />
          <Route path="/insurance" element={gate("insurance", <Insurance />)} />
          <Route path="/insurance/:id" element={gate("insurance", <InsuranceDetail />)} />
          <Route path="/advisers" element={<PeopleAndEntities />} />
          <Route path="/portfolio-plans" element={gate("portfolio-plan", <PortfolioPlans />)} />
          <Route path="/portfolio-plans/:id" element={gate("portfolio-plan", <PortfolioPlanDetail />)} />
          <Route path="/borrowing" element={gate("borrowing", <Borrowing />)} />
          <Route path="/accountant-checklist" element={gate("accountant", <AccountantChecklist />)} />
          <Route path="/structure-comparison" element={gate("structure", <StructureComparison />)} />
          <Route path="/missing" element={gate("expected", <Missing />)} />
          <Route path="/net-worth" element={<NetWorth />} />
          <Route path="/tax" element={<Tax />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/packs" element={gate("packs", <Packs />)} />
          <Route path="/email-import" element={gate("gmail", <EmailImport />)} />
          <Route path="/bulk-import" element={gate("bulk-import", <BulkImport />)} />
          <Route path="/bulk-import/:id" element={gate("bulk-import", <BulkImport />)} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
          <Route
            path="*"
            element={<LoadFailed message="Page not found" backTo="/" backLabel="Back to the dashboard" />}
          />
        </Routes>
      </main>
    </div>
  );
}
