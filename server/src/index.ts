import express from "express";
import cors from "cors";
import { entitiesRouter } from "./routes/entities.js";
import { documentsRouter } from "./routes/documents.js";
import { financialYearsRouter } from "./routes/financialYears.js";
import { taxCategoriesRouter } from "./routes/taxCategories.js";
import { searchRouter } from "./routes/search.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { auditRouter } from "./routes/audit.js";
import { settingsRouter } from "./routes/settings.js";
import { propertiesRouter } from "./routes/properties.js";
import { liabilitiesRouter } from "./routes/liabilities.js";
import { investmentsRouter } from "./routes/investments.js";
import { bankingRouter } from "./routes/banking.js";
import { assetsRouter } from "./routes/assets.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/entities", entitiesRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/financial-years", financialYearsRouter);
app.use("/api/tax-categories", taxCategoriesRouter);
app.use("/api/search", searchRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/audit", auditRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/properties", propertiesRouter);
app.use("/api/liabilities", liabilitiesRouter);
app.use("/api/investments", investmentsRouter);
app.use("/api/banking", bankingRouter);
app.use("/api/assets", assetsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Financial Vault server listening on port ${PORT}`);
});
