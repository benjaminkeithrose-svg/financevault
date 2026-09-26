-- CreateTable
CREATE TABLE "Security" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "assetClass" TEXT NOT NULL,
    "exchange" TEXT,
    "priceSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "providerSymbol" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InvestmentParcel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentAccountId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "acquisitionDate" DATETIME NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "brokerage" REAL NOT NULL DEFAULT 0,
    "acquisitionType" TEXT NOT NULL DEFAULT 'PURCHASE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvestmentParcel_investmentAccountId_fkey" FOREIGN KEY ("investmentAccountId") REFERENCES "InvestmentAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentParcel_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentDisposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentAccountId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "disposalDate" DATETIME NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "brokerage" REAL NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'FIFO',
    "financialYearId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvestmentDisposal_investmentAccountId_fkey" FOREIGN KEY ("investmentAccountId") REFERENCES "InvestmentAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentDisposal_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestmentDisposal_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisposalAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disposalId" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    CONSTRAINT "DisposalAllocation_disposalId_fkey" FOREIGN KEY ("disposalId") REFERENCES "InvestmentDisposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DisposalAllocation_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "InvestmentParcel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentDividend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentAccountId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "frankedAmount" REAL NOT NULL DEFAULT 0,
    "unfrankedAmount" REAL NOT NULL DEFAULT 0,
    "frankingCredit" REAL NOT NULL DEFAULT 0,
    "capitalGainsAmount" REAL NOT NULL DEFAULT 0,
    "foreignIncome" REAL NOT NULL DEFAULT 0,
    "foreignTaxCredit" REAL NOT NULL DEFAULT 0,
    "reinvestedParcelId" TEXT,
    "financialYearId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentDividend_investmentAccountId_fkey" FOREIGN KEY ("investmentAccountId") REFERENCES "InvestmentAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentDividend_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestmentDividend_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "priceDate" DATETIME NOT NULL,
    "price" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityPrice_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Security_code_key" ON "Security"("code");

-- CreateIndex
CREATE INDEX "Security_assetClass_idx" ON "Security"("assetClass");

-- CreateIndex
CREATE INDEX "InvestmentParcel_investmentAccountId_idx" ON "InvestmentParcel"("investmentAccountId");

-- CreateIndex
CREATE INDEX "InvestmentParcel_securityId_idx" ON "InvestmentParcel"("securityId");

-- CreateIndex
CREATE INDEX "InvestmentDisposal_investmentAccountId_idx" ON "InvestmentDisposal"("investmentAccountId");

-- CreateIndex
CREATE INDEX "InvestmentDisposal_securityId_idx" ON "InvestmentDisposal"("securityId");

-- CreateIndex
CREATE INDEX "InvestmentDisposal_financialYearId_idx" ON "InvestmentDisposal"("financialYearId");

-- CreateIndex
CREATE INDEX "DisposalAllocation_disposalId_idx" ON "DisposalAllocation"("disposalId");

-- CreateIndex
CREATE INDEX "DisposalAllocation_parcelId_idx" ON "DisposalAllocation"("parcelId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentDividend_reinvestedParcelId_key" ON "InvestmentDividend"("reinvestedParcelId");

-- CreateIndex
CREATE INDEX "InvestmentDividend_investmentAccountId_idx" ON "InvestmentDividend"("investmentAccountId");

-- CreateIndex
CREATE INDEX "InvestmentDividend_securityId_idx" ON "InvestmentDividend"("securityId");

-- CreateIndex
CREATE INDEX "InvestmentDividend_financialYearId_idx" ON "InvestmentDividend"("financialYearId");

-- CreateIndex
CREATE INDEX "SecurityPrice_securityId_idx" ON "SecurityPrice"("securityId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityPrice_securityId_priceDate_key" ON "SecurityPrice"("securityId", "priceDate");
