import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { entitiesRouter } from "./routes/entities.js";
import { peopleRouter } from "./routes/people.js";
import { documentsRouter } from "./routes/documents.js";
import { financialYearsRouter } from "./routes/financialYears.js";
import { taxCategoriesRouter } from "./routes/taxCategories.js";
import { searchRouter } from "./routes/search.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { auditRouter } from "./routes/audit.js";
import { settingsRouter } from "./routes/settings.js";
import { propertiesRouter } from "./routes/properties.js";
import { commercialPropertiesRouter } from "./routes/commercialProperties.js";
import { liabilitiesRouter } from "./routes/liabilities.js";
import { investmentsRouter } from "./routes/investments.js";
import { bankingRouter } from "./routes/banking.js";
import { assetsRouter } from "./routes/assets.js";
import { graphRouter } from "./routes/graph.js";
import { netWorthRouter } from "./routes/netWorth.js";
import { taxRouter } from "./routes/tax.js";
import { reportsRouter } from "./routes/reports.js";
import { documentPacksRouter } from "./routes/documentPacks.js";
import { portfolioPlansRouter } from "./routes/portfolioPlans.js";
import { backupRouter } from "./routes/backup.js";
import { emailImportRouter } from "./routes/emailImport.js";
import { importBatchesRouter } from "./routes/importBatches.js";
import { transactionImportRouter } from "./routes/transactionImport.js";
import { vaultRouter, requireSession } from "./routes/vault.js";
import { identityRouter } from "./routes/identity.js";
import { calendarRouter } from "./routes/calendar.js";
import { smsfRouter } from "./routes/smsf.js";
import { treeRouter } from "./routes/tree.js";
import { insuranceRouter } from "./routes/insurance.js";
import { estateRouter } from "./routes/estate.js";
import { advisersRouter } from "./routes/advisers.js";
import { referenceLibraryRouter } from "./routes/referenceLibrary.js";
import { debtAllocationRouter } from "./routes/debtAllocation.js";
import { claimNotesRouter } from "./routes/claimNotes.js";
import { borrowingRouter } from "./routes/borrowing.js";
import { paygRouter } from "./routes/payg.js";
import { adviceRouter } from "./routes/advice.js";
import { apiNotFound, errorHandler } from "./middleware/errorHandler.js";
import { rejectCrossOriginWrites, requireLoopbackHost, securityHeaders } from "./middleware/localOnly.js";

export const app = express();

// No CORS: the web app is served from this same origin (and proxied to it in
// development), so no other origin ever needs to read these responses. The
// old wide-open CORS let any website visited while the app was running read
// the entire database with a single fetch.
app.use(requireLoopbackHost);
app.use(securityHeaders);
app.use(rejectCrossOriginWrites);
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// The only API routes reachable while locked are the ones that unlock it.
app.use("/api/vault", vaultRouter);
app.use("/api", requireSession);

app.use("/api/entities", entitiesRouter);
app.use("/api/people", peopleRouter);
app.use("/api/identity", identityRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/smsf", smsfRouter);
app.use("/api/tree", treeRouter);
app.use("/api/insurance", insuranceRouter);
app.use("/api/estate", estateRouter);
app.use("/api/advisers", advisersRouter);
app.use("/api/reference-library", referenceLibraryRouter);
app.use("/api/debt-allocation", debtAllocationRouter);
app.use("/api/claim-notes", claimNotesRouter);
app.use("/api/borrowing", borrowingRouter);
app.use("/api/payg", paygRouter);
app.use("/api", adviceRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/financial-years", financialYearsRouter);
app.use("/api/tax-categories", taxCategoriesRouter);
app.use("/api/search", searchRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/audit", auditRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/properties", propertiesRouter);
app.use("/api/commercial-properties", commercialPropertiesRouter);
app.use("/api/liabilities", liabilitiesRouter);
app.use("/api/investments", investmentsRouter);
app.use("/api/banking", bankingRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/graph", graphRouter);
app.use("/api/net-worth", netWorthRouter);
app.use("/api/tax-records", taxRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/document-packs", documentPacksRouter);
app.use("/api/portfolio-plans", portfolioPlansRouter);
app.use("/api/backup", backupRouter);
app.use("/api/email-import", emailImportRouter);
app.use("/api/import-batches", importBatchesRouter);
app.use("/api/transaction-import", transactionImportRouter);

app.use("/api", apiNotFound);
app.use(errorHandler);

// Serving the built frontend from this same process (single double-click
// launcher, one port, no separate dev server) — only when a build exists.
// In development the web app runs on its own Vite dev server instead.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(currentDir, "../../web/dist");
if (fs.existsSync(webDist)) {
  // redirect: false — the built files live in dist/assets, and without it a
  // visit to the /assets page is redirected to /assets/ as if it were that folder.
  app.use(express.static(webDist, { redirect: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}
