// Document type catalogue (spec section 13) with keyword hints used by the
// heuristic classifier. Not exhaustive — users can still enter free text.

export interface DocumentTypeDef {
  name: string;
  category: "Tax" | "Property" | "Investment" | "Personal" | "Finance" | "Trust/Company" | "Commercial Property" | "Reference";
  keywords: string[];
}

export const DOCUMENT_TYPES: DocumentTypeDef[] = [
  // Tax
  { name: "Tax Return", category: "Tax", keywords: ["tax return", "individual tax return", "income tax return"] },
  { name: "Notice of Assessment", category: "Tax", keywords: ["notice of assessment", "ato notice"] },
  { name: "PAYG Summary / Income Statement", category: "Tax", keywords: ["payg", "income statement", "payment summary"] },
  { name: "Payslip", category: "Tax", keywords: ["payslip", "pay advice", "net pay", "gross pay", "pay slip"] },
  { name: "Tax Agent Correspondence", category: "Tax", keywords: ["tax agent", "accountant letter"] },
  // Rulings, guides and rate tables — general rules, kept out of every pack.
  // Listed before ATO Correspondence so a ruling isn't filed as a letter.
  {
    name: "Tax Reference",
    category: "Reference",
    keywords: [
      "taxation ruling",
      "taxation determination",
      "practical compliance guideline",
      "law companion ruling",
      "goods and services tax ruling",
      "self managed superannuation funds ruling",
      "public ruling",
      "this ruling",
      "print whole section",
      "prudential practice guide",
      "regulatory guide",
      "australian prudential regulation authority",
      "authorised deposit-taking institution",
      // Printed web pages (ATO, Revenue NSW) rather than letters.
      "our commitment to you",
      "copyright notice",
      "legal database",
      "on this page",
      "last updated",
    ],
  },
  { name: "ATO Correspondence", category: "Tax", keywords: ["australian taxation office", "ato.gov.au"] },
  { name: "Deduction Evidence", category: "Tax", keywords: ["receipt", "tax invoice"] },

  // Property
  { name: "Contract of Sale", category: "Property", keywords: ["contract of sale", "vendor", "purchaser"] },
  { name: "Settlement Statement", category: "Property", keywords: ["settlement statement", "settlement date"] },
  { name: "Loan Document", category: "Property", keywords: ["loan agreement", "mortgage document"] },
  { name: "Loan Statement", category: "Property", keywords: ["loan statement", "home loan statement"] },
  { name: "Rental Statement", category: "Property", keywords: ["rental statement", "property management statement", "tenancy"] },
  { name: "Insurance", category: "Property", keywords: ["insurance", "policy schedule", "renewal notice", "premium"] },
  { name: "Council Rates", category: "Property", keywords: ["council rates", "rates notice"] },
  { name: "Water Rates", category: "Property", keywords: ["water rates", "water usage"] },
  { name: "Land Tax", category: "Property", keywords: ["land tax"] },
  { name: "Repairs & Maintenance", category: "Property", keywords: ["repair", "maintenance invoice"] },
  { name: "Property Management", category: "Property", keywords: ["property manager", "letting fee", "management fee"] },
  { name: "Depreciation Schedule", category: "Property", keywords: ["depreciation schedule", "quantity surveyor", "capital allowance"] },

  // Investment
  { name: "Trade Confirmation", category: "Investment", keywords: ["trade confirmation", "contract note"] },
  { name: "Dividend Statement", category: "Investment", keywords: ["dividend statement", "dividend payment"] },
  { name: "Distribution Statement", category: "Investment", keywords: ["distribution statement", "annual tax statement"] },
  { name: "CGT Statement", category: "Investment", keywords: ["capital gains", "cgt statement"] },
  { name: "Brokerage Statement", category: "Investment", keywords: ["brokerage", "share registry"] },
  { name: "Portfolio Statement", category: "Investment", keywords: ["portfolio statement", "portfolio valuation"] },

  // Personal
  { name: "Motor Vehicle Insurance", category: "Personal", keywords: ["motor vehicle insurance", "car insurance", "comprehensive insurance"] },
  { name: "Vehicle Registration", category: "Personal", keywords: ["registration renewal", "vehicle registration"] },
  { name: "Utilities", category: "Personal", keywords: ["electricity", "gas bill", "utility bill"] },
  { name: "Home Insurance", category: "Personal", keywords: ["home and contents", "home insurance", "building insurance"] },
  { name: "Medical", category: "Personal", keywords: ["medicare", "health fund", "medical invoice"] },
  { name: "Major Purchase", category: "Personal", keywords: ["tax invoice", "purchase receipt"] },

  // Finance
  { name: "Loan Application", category: "Finance", keywords: ["loan application"] },
  { name: "Loan Approval", category: "Finance", keywords: ["loan approval", "letter of offer"] },
  { name: "Valuation", category: "Finance", keywords: ["valuation report", "property valuation"] },
  { name: "Bank Statement", category: "Finance", keywords: ["bank statement", "account statement"] },
  { name: "Broker Correspondence", category: "Finance", keywords: ["mortgage broker"] },
  { name: "Asset & Liability Statement", category: "Finance", keywords: ["asset and liability statement", "statement of position"] },

  // Trust/Company
  { name: "Trust Deed", category: "Trust/Company", keywords: ["trust deed", "declaration of trust"] },
  { name: "Trust Amendment", category: "Trust/Company", keywords: ["deed of variation", "trust amendment"] },
  { name: "Company Constitution", category: "Trust/Company", keywords: ["company constitution"] },
  { name: "ASIC Document", category: "Trust/Company", keywords: ["asic", "australian securities and investments commission"] },
  { name: "Annual Statement", category: "Trust/Company", keywords: ["annual statement", "annual review"] },
  { name: "Distribution Statement (Trust)", category: "Trust/Company", keywords: ["trust distribution", "beneficiary distribution"] },
  { name: "Financial Statement", category: "Trust/Company", keywords: ["financial statements", "balance sheet", "profit and loss"] },

  // Commercial Property (spec section 29)
  { name: "Lease", category: "Commercial Property", keywords: ["lease agreement", "deed of lease", "agreement to lease"] },
  { name: "Lease Amendment", category: "Commercial Property", keywords: ["deed of variation of lease", "lease amendment"] },
  { name: "Rent Review", category: "Commercial Property", keywords: ["rent review notice", "market rent review"] },
  { name: "Property Management Agreement", category: "Commercial Property", keywords: ["management agreement", "agency agreement"] },
  { name: "Outgoings Statement", category: "Commercial Property", keywords: ["outgoings statement", "outgoings estimate", "outgoings reconciliation"] },
  { name: "Tenant Invoice", category: "Commercial Property", keywords: ["tax invoice to tenant", "tenant invoice"] },
  { name: "Tenant Recovery", category: "Commercial Property", keywords: ["outgoings recovery", "recovery notice"] },
  { name: "Bank Guarantee", category: "Commercial Property", keywords: ["bank guarantee", "guarantee document"] },
  { name: "Bond", category: "Commercial Property", keywords: ["rental bond", "lease bond"] },
  { name: "Quantity Surveyor Report", category: "Commercial Property", keywords: ["quantity surveyor", "tax depreciation report"] },
  { name: "Capital Works Invoice", category: "Commercial Property", keywords: ["capital works", "fitout invoice"] },
  { name: "Building Inspection", category: "Commercial Property", keywords: ["building inspection report", "dilapidation report"] },
  { name: "Environmental Report", category: "Commercial Property", keywords: ["environmental report", "contamination report"] },
  { name: "Fire Compliance", category: "Commercial Property", keywords: ["fire safety statement", "essential services", "afss"] },
  { name: "Building Certification", category: "Commercial Property", keywords: ["occupation certificate", "building certification"] },
];

export function findDocumentTypeByKeyword(text: string): DocumentTypeDef | null {
  const lower = text.toLowerCase();
  let best: { def: DocumentTypeDef; hits: number } | null = null;
  for (const def of DOCUMENT_TYPES) {
    const hits = def.keywords.filter((k) => lower.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { def, hits };
    }
  }
  return best?.def ?? null;
}
