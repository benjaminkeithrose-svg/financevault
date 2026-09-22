import "dotenv/config";
import express from "express";
import cors from "cors";
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
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/entities", entitiesRouter);
app.use("/api/people", peopleRouter);
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

app.use(errorHandler);

// Serving the built frontend from this same process (single double-click
// launcher, one port, no separate dev server) — only when a build exists.
// In development the web app runs on its own Vite dev server instead.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(currentDir, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Financial Vault server listening on port ${PORT}`);
});
