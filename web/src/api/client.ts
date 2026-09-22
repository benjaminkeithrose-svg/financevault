const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Entity {
  id: string;
  name: string;
  entityType: string;
  abn?: string | null;
  tfn?: string | null;
  acn?: string | null;
  establishmentDate?: string | null;
  ownershipInfo?: string | null;
  contactInfo?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number; assets: number; liabilities: number };
  relationshipsFrom?: EntityRelationship[];
  relationshipsTo?: EntityRelationship[];
  personRelationships?: PersonEntityRelationship[];
  documents?: Document[];
  assets?: Asset[];
  liabilities?: Liability[];
  accounts?: Account[];
  properties?: Property[];
  commercialProperties?: CommercialProperty[];
  investmentAccounts?: InvestmentAccount[];
  taxRecords?: unknown[];
  financialPosition?: {
    byAssetType: Record<string, number>;
    cash: number;
    totalAssets: number;
    totalLiabilities: number;
    netAssets: number;
    formula: string;
  };
}

export interface Person {
  id: string;
  name: string;
  dateOfBirth?: string | null;
  tfn?: string | null;
  contactInfo?: string | null;
  notes?: string | null;
  entityRelationships?: PersonEntityRelationship[];
  documents?: Document[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonEntityRelationship {
  id: string;
  personId: string;
  entityId: string;
  relationshipType: string;
  ownershipPercent?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  person?: Person;
  entity?: Entity;
}

export interface EntityRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  ownershipPercent?: number | null;
  notes?: string | null;
  fromEntity?: Entity;
  toEntity?: Entity;
}

export interface FinancialYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface TaxCategory {
  id: string;
  name: string;
  group: string;
  description?: string | null;
}

export interface Document {
  id: string;
  originalFilename: string;
  storedFilename: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  version: number;
  documentType?: string | null;
  source: string;
  uploadDate: string;
  documentDate?: string | null;
  financialYearId?: string | null;
  financialYear?: FinancialYear | null;
  entityId?: string | null;
  entity?: Entity | null;
  amount?: number | null;
  supplier?: string | null;
  taxCategoryId?: string | null;
  taxCategory?: TaxCategory | null;
  taxRelevance: string;
  confidenceScore?: number | null;
  ocrText?: string | null;
  aiSummary?: string | null;
  tags?: string | null;
  notes?: string | null;
  retentionDate?: string | null;
  reviewStatus: string;
  renewalDate?: string | null;
  createdAt: string;
  updatedAt: string;
  links?: DocumentLink[];
}

export interface DocumentLink {
  id: string;
  documentId: string;
  targetType: string;
  targetId: string;
  label?: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  documents: {
    pendingClassification: number;
    needsConfirmation: number;
    missingInformation: number;
    recentDocuments: Document[];
    upcomingRenewals: Document[];
  };
  financialSnapshot: {
    totalAssets: number;
    totalLiabilities: number;
    netPosition: number;
    cash: number;
    investmentValue: number;
    propertyValue: number;
    superannuation: number;
  };
  tax: {
    financialYearLabel: string;
    incomeRecorded: number;
    expensesRecorded: number;
    propertyIncome: number;
    propertyExpenses: number;
    investmentIncome: number;
    needsReviewCount: number;
    unclassifiedTransactions: number;
  };
  consolidated: {
    byEntity: Array<{
      entityId: string;
      entityName: string;
      entityType: string;
      totalAssets: number;
      totalLiabilities: number;
      netAssets: number;
    }>;
    note: string;
  };
}

export interface Settings {
  id: number;
  allowExternalAiProcessing: boolean;
}

export interface Asset {
  id: string;
  name: string;
  assetType: string;
  entityId: string;
  entity?: Entity;
  acquisitionDate?: string | null;
  acquisitionCost?: number | null;
  currentValue?: number | null;
  valuationDate?: string | null;
  disposalDate?: string | null;
  disposalValue?: number | null;
  notes?: string | null;
  property?: Property | null;
  documents?: Document[];
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  assetId: string;
  asset?: Asset;
  entityId: string;
  entity?: Entity;
  address: string;
  state?: string | null;
  purchaseDate?: string | null;
  settlementDate?: string | null;
  purchasePrice?: number | null;
  ownershipPercent?: number | null;
  tenantInfo?: string | null;
  propertyManager?: string | null;
  liabilities?: Liability[];
  documents?: Document[];
  summary?: Record<string, { total: number; byCategory: Record<string, number> }>;
  createdAt: string;
  updatedAt: string;
}

export interface Liability {
  id: string;
  name: string;
  liabilityType: string;
  entityId: string;
  entity?: Entity;
  lender?: string | null;
  originalAmount?: number | null;
  currentBalance?: number | null;
  interestRate?: number | null;
  loanType?: string | null;
  fixedPeriodEnds?: string | null;
  repaymentAmount?: number | null;
  maturityDate?: string | null;
  securityPropertyId?: string | null;
  securityProperty?: Property | null;
  securityCommercialPropertyId?: string | null;
  securityCommercialProperty?: CommercialProperty | null;
  interestOnly?: boolean | null;
  loanTermYears?: number | null;
  repaymentFrequency?: string | null;
  loanFees?: number | null;
  establishmentFees?: number | null;
  valuationFees?: number | null;
  notes?: string | null;
  documents?: Document[];
  createdAt: string;
  updatedAt: string;
}

export interface RentReview {
  id: string;
  tenancyId: string;
  reviewDate: string;
  reviewMechanism?: string | null;
  previousRent?: number | null;
  newRent?: number | null;
  actualVsExpected?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Tenancy {
  id: string;
  commercialPropertyId: string;
  tenantName: string;
  tenantLegalName?: string | null;
  tradingName?: string | null;
  contactDetails?: string | null;
  leaseCommencement?: string | null;
  leaseExpiry?: string | null;
  optionPeriods?: string | null;
  rentCommencement?: string | null;
  currentBaseRent?: number | null;
  rentFrequency?: string | null;
  rentPerAnnum?: number | null;
  rentPerSqm?: number | null;
  nlaOccupied?: number | null;
  securityDeposit?: number | null;
  bankGuarantee?: number | null;
  bond?: number | null;
  incentives?: string | null;
  rentFreeMonths?: number | null;
  reviewMechanism?: string | null;
  reviewPercentage?: number | null;
  nextRentReview?: string | null;
  cpiLinked?: boolean | null;
  outgoingsArrangement?: string | null;
  gstTreatment?: string | null;
  leaseStatus: string;
  notes?: string | null;
  rentReviews?: RentReview[];
  createdAt: string;
  updatedAt: string;
}

export interface OutgoingRecord {
  id: string;
  commercialPropertyId: string;
  date: string;
  category: string;
  supplier?: string | null;
  amount: number;
  gst?: number | null;
  tenancyId?: string | null;
  recoverable: boolean;
  recoveryPercent?: number | null;
  recoveredAmount?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface CapitalExpenditureItem {
  id: string;
  commercialPropertyId: string;
  date: string;
  description: string;
  amount: number;
  gst?: number | null;
  usefulLifeYears?: number | null;
  depreciationInfo?: string | null;
  taxTreatmentStatus: string;
  notes?: string | null;
  createdAt: string;
}

export interface OccupancySnapshot {
  id: string;
  commercialPropertyId: string;
  asAtDate: string;
  totalNla: number;
  occupiedNla: number;
  notes?: string | null;
  createdAt: string;
}

export interface AnnualPropertySnapshot {
  id: string;
  commercialPropertyId: string;
  financialYearId: string;
  financialYear?: FinancialYear;
  propertyValue?: number | null;
  debt?: number | null;
  equity?: number | null;
  rent?: number | null;
  recoveries?: number | null;
  operatingExpenses?: number | null;
  noi?: number | null;
  interest?: number | null;
  principal?: number | null;
  cashFlow?: number | null;
  capRate?: number | null;
  grossYield?: number | null;
  netYield?: number | null;
  lvr?: number | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialPropertyMetrics {
  period: { basis: string };
  occupancy: {
    totalNla: number | null;
    occupiedNla: number;
    vacantNla: number | null;
    occupancyPercent: number | null;
    vacancyPercent: number | null;
    formula: string;
  };
  tenantConcentration: {
    totalRent: number;
    tenants: Array<{
      tenancyId: string;
      tenantName: string;
      annualRent: number;
      percentOfRent: number | null;
      nlaOccupied?: number | null;
      percentOfNla: number | null;
    }>;
    top3: unknown[];
    largestTenant: { tenantName: string; percentOfRent: number | null } | null;
    formula: string;
  };
  wale: {
    waleByLeaseYears: number | null;
    waleByRentYears: number | null;
    leaseCount: number;
    formula: { byLease: string; byRent: string } | null;
  };
  income: {
    grossRent: number;
    otherIncome: number;
    recoveries: number;
    grossPropertyIncome: number;
    grossOperatingExpenses: number;
    unrecoveredExpenses: number;
    noi: number;
    formula: string;
  };
  yields: {
    grossYield: number | null;
    netYield: number | null;
    capRate: number | null;
    propertyValue: number | null;
    valuationBasis: "current" | "purchase";
    formula?: { grossYield: string; netYield: string; capRate: string };
  };
  debt: {
    totalDebt: number;
    equity: number | null;
    lvr: number | null;
    estimatedAnnualInterest: number;
    annualDebtService: number;
    formula: { lvr: string; equity: string; estimatedAnnualInterest: string; annualDebtService: string };
  };
  cashFlowAfterFinancing: { value: number; status: string; formula: string };
}

export interface CommercialProperty {
  id: string;
  assetId: string;
  asset?: Asset;
  entityId: string;
  entity?: Entity;
  name: string;
  address: string;
  state?: string | null;
  postcode?: string | null;
  propertyTypes: string; // comma-separated
  ownershipPercent?: number | null;
  purchaseDate?: string | null;
  settlementDate?: string | null;
  purchasePrice?: number | null;
  valuationDate?: string | null;
  valuer?: string | null;
  buildingArea?: number | null;
  landArea?: number | null;
  areaUnit?: string | null;
  numberOfTenancies?: number | null;
  numberOfBuildings?: number | null;
  carSpaces?: number | null;
  zoning?: string | null;
  constructionType?: string | null;
  yearBuilt?: number | null;
  refurbishmentDate?: string | null;
  nla?: number | null;
  gla?: number | null;
  siteArea?: number | null;
  tenancies?: Tenancy[];
  loans?: Liability[];
  outgoings?: OutgoingRecord[];
  capitalExpenditure?: CapitalExpenditureItem[];
  occupancySnapshots?: OccupancySnapshot[];
  annualSnapshots?: AnnualPropertySnapshot[];
  documents?: Document[];
  metrics?: CommercialPropertyMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentHolding {
  id: string;
  investmentAccountId: string;
  code: string;
  quantity?: number | null;
  acquisitionDate?: string | null;
  purchasePrice?: number | null;
  disposalDate?: string | null;
  salePrice?: number | null;
  costBase?: number | null;
  brokerage?: number | null;
  notes?: string | null;
}

export interface InvestmentAccount {
  id: string;
  institution: string;
  accountRef?: string | null;
  entityId: string;
  entity?: Entity;
  accountType: string;
  notes?: string | null;
  holdings: InvestmentHolding[];
  documents?: Document[];
  realisedGainLoss?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  counterparty?: string | null;
  taxCategoryId?: string | null;
  taxCategory?: TaxCategory | null;
  entityId?: string | null;
  financialYearId?: string | null;
  financialYear?: FinancialYear | null;
  taxRelevance: string;
  status: string;
  notes?: string | null;
  documentId?: string | null;
}

export interface Account {
  id: string;
  institution: string;
  accountName: string;
  accountNumber?: string | null;
  bsb?: string | null;
  entityId: string;
  entity?: Entity;
  accountType: string;
  currency: string;
  openingBalance?: number | null;
  currentBalance?: number | null;
  transactions?: Transaction[];
  documents?: Document[];
  _count?: { transactions: number };
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  documentId?: string | null;
  details?: string | null;
}

export const api = {
  dashboard: (entityId?: string) => request<DashboardSummary>(`/dashboard${entityId ? `?entityId=${entityId}` : ""}`),

  entities: {
    list: (entityType?: string) => request<Entity[]>(`/entities${entityType ? `?entityType=${entityType}` : ""}`),
    get: (id: string) => request<Entity>(`/entities/${id}`),
    create: (data: Partial<Entity>) => request<Entity>("/entities", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Entity>) =>
      request<Entity>(`/entities/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/entities/${id}`, { method: "DELETE" }),
    addRelationship: (data: Partial<EntityRelationship>) =>
      request<EntityRelationship>("/entities/relationships", { method: "POST", body: JSON.stringify(data) }),
    removeRelationship: (id: string) => request<void>(`/entities/relationships/${id}`, { method: "DELETE" }),
  },

  people: {
    list: () => request<Person[]>("/people"),
    get: (id: string) => request<Person>(`/people/${id}`),
    create: (data: Partial<Person>) => request<Person>("/people", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Person>) =>
      request<Person>(`/people/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/people/${id}`, { method: "DELETE" }),
    addRelationship: (data: Partial<PersonEntityRelationship>) =>
      request<PersonEntityRelationship>("/people/relationships", { method: "POST", body: JSON.stringify(data) }),
    removeRelationship: (id: string) => request<void>(`/people/relationships/${id}`, { method: "DELETE" }),
  },

  documents: {
    list: (params?: Record<string, string>) =>
      request<Document[]>(`/documents${params ? `?${new URLSearchParams(params)}` : ""}`),
    get: (id: string) => request<Document>(`/documents/${id}`),
    upload: async (file: File): Promise<{ duplicate: boolean; document: Document }> => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/documents/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed: ${res.status}`);
      }
      return res.json();
    },
    update: (id: string, data: Record<string, unknown>) =>
      request<Document>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    confirm: (id: string) => request<Document>(`/documents/${id}/confirm`, { method: "POST" }),
    remove: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
    addLink: (id: string, data: { targetType: string; targetId: string; label?: string }) =>
      request<DocumentLink>(`/documents/${id}/links`, { method: "POST", body: JSON.stringify(data) }),
    removeLink: (id: string, linkId: string) =>
      request<void>(`/documents/${id}/links/${linkId}`, { method: "DELETE" }),
    byTarget: (targetType: string, targetId: string) =>
      request<Array<DocumentLink & { document: Document }>>(
        `/documents/by-target?targetType=${targetType}&targetId=${targetId}`
      ),
    fileUrl: (id: string) => `${BASE}/documents/${id}/file`,
  },

  financialYears: {
    list: () => request<FinancialYear[]>("/financial-years"),
  },

  taxCategories: {
    list: () => request<TaxCategory[]>("/tax-categories"),
  },

  search: (q: string) => request<{ documents: Document[]; entities: Entity[] }>(`/search?q=${encodeURIComponent(q)}`),

  settings: {
    get: () => request<Settings>("/settings"),
    update: (data: Partial<Settings>) => request<Settings>("/settings", { method: "PUT", body: JSON.stringify(data) }),
  },

  audit: {
    list: (documentId?: string) => request<AuditLogEntry[]>(`/audit${documentId ? `?documentId=${documentId}` : ""}`),
  },

  properties: {
    list: (entityId?: string) => request<Property[]>(`/properties${entityId ? `?entityId=${entityId}` : ""}`),
    get: (id: string) => request<Property>(`/properties/${id}`),
    create: (data: Record<string, unknown>) => request<Property>("/properties", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Property>(`/properties/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/properties/${id}`, { method: "DELETE" }),
  },

  liabilities: {
    list: (params?: Record<string, string>) =>
      request<Liability[]>(`/liabilities${params ? `?${new URLSearchParams(params)}` : ""}`),
    get: (id: string) => request<Liability>(`/liabilities/${id}`),
    create: (data: Record<string, unknown>) =>
      request<Liability>("/liabilities", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Liability>(`/liabilities/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/liabilities/${id}`, { method: "DELETE" }),
  },

  investments: {
    list: (entityId?: string) => request<InvestmentAccount[]>(`/investments${entityId ? `?entityId=${entityId}` : ""}`),
    get: (id: string) => request<InvestmentAccount>(`/investments/${id}`),
    create: (data: Record<string, unknown>) =>
      request<InvestmentAccount>("/investments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<InvestmentAccount>(`/investments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/investments/${id}`, { method: "DELETE" }),
    addHolding: (accountId: string, data: Record<string, unknown>) =>
      request<InvestmentHolding>(`/investments/${accountId}/holdings`, { method: "POST", body: JSON.stringify(data) }),
    updateHolding: (holdingId: string, data: Record<string, unknown>) =>
      request<InvestmentHolding>(`/investments/holdings/${holdingId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeHolding: (holdingId: string) =>
      request<void>(`/investments/holdings/${holdingId}`, { method: "DELETE" }),
  },

  banking: {
    listAccounts: (entityId?: string) => request<Account[]>(`/banking/accounts${entityId ? `?entityId=${entityId}` : ""}`),
    getAccount: (id: string) => request<Account>(`/banking/accounts/${id}`),
    createAccount: (data: Record<string, unknown>) =>
      request<Account>("/banking/accounts", { method: "POST", body: JSON.stringify(data) }),
    updateAccount: (id: string, data: Record<string, unknown>) =>
      request<Account>(`/banking/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removeAccount: (id: string) => request<void>(`/banking/accounts/${id}`, { method: "DELETE" }),
    addTransaction: (accountId: string, data: Record<string, unknown>) =>
      request<Transaction>(`/banking/accounts/${accountId}/transactions`, { method: "POST", body: JSON.stringify(data) }),
    updateTransaction: (transactionId: string, data: Record<string, unknown>) =>
      request<Transaction>(`/banking/transactions/${transactionId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeTransaction: (transactionId: string) =>
      request<void>(`/banking/transactions/${transactionId}`, { method: "DELETE" }),
  },

  assets: {
    list: (params?: Record<string, string>) => request<Asset[]>(`/assets${params ? `?${new URLSearchParams(params)}` : ""}`),
    get: (id: string) => request<Asset>(`/assets/${id}`),
    create: (data: Record<string, unknown>) => request<Asset>("/assets", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Asset>(`/assets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/assets/${id}`, { method: "DELETE" }),
  },

  commercialProperties: {
    list: (entityId?: string) =>
      request<CommercialProperty[]>(`/commercial-properties${entityId ? `?entityId=${entityId}` : ""}`),
    get: (id: string, valuationBasis?: "current" | "purchase") =>
      request<CommercialProperty>(`/commercial-properties/${id}${valuationBasis ? `?valuationBasis=${valuationBasis}` : ""}`),
    create: (data: Record<string, unknown>) =>
      request<CommercialProperty>("/commercial-properties", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<CommercialProperty>(`/commercial-properties/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/commercial-properties/${id}`, { method: "DELETE" }),

    addTenancy: (propertyId: string, data: Record<string, unknown>) =>
      request<Tenancy>(`/commercial-properties/${propertyId}/tenancies`, { method: "POST", body: JSON.stringify(data) }),
    updateTenancy: (tenancyId: string, data: Record<string, unknown>) =>
      request<Tenancy>(`/commercial-properties/tenancies/${tenancyId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeTenancy: (tenancyId: string) =>
      request<void>(`/commercial-properties/tenancies/${tenancyId}`, { method: "DELETE" }),

    addRentReview: (tenancyId: string, data: Record<string, unknown>) =>
      request<RentReview>(`/commercial-properties/tenancies/${tenancyId}/rent-reviews`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    removeRentReview: (id: string) => request<void>(`/commercial-properties/rent-reviews/${id}`, { method: "DELETE" }),

    addOutgoing: (propertyId: string, data: Record<string, unknown>) =>
      request<OutgoingRecord>(`/commercial-properties/${propertyId}/outgoings`, { method: "POST", body: JSON.stringify(data) }),
    updateOutgoing: (id: string, data: Record<string, unknown>) =>
      request<OutgoingRecord>(`/commercial-properties/outgoings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removeOutgoing: (id: string) => request<void>(`/commercial-properties/outgoings/${id}`, { method: "DELETE" }),

    addCapex: (propertyId: string, data: Record<string, unknown>) =>
      request<CapitalExpenditureItem>(`/commercial-properties/${propertyId}/capital-expenditure`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateCapex: (id: string, data: Record<string, unknown>) =>
      request<CapitalExpenditureItem>(`/commercial-properties/capital-expenditure/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    removeCapex: (id: string) => request<void>(`/commercial-properties/capital-expenditure/${id}`, { method: "DELETE" }),

    addOccupancySnapshot: (propertyId: string, data: Record<string, unknown>) =>
      request<OccupancySnapshot>(`/commercial-properties/${propertyId}/occupancy-snapshots`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    removeOccupancySnapshot: (id: string) =>
      request<void>(`/commercial-properties/occupancy-snapshots/${id}`, { method: "DELETE" }),

    previewAnnualSnapshot: (propertyId: string, valuationBasis?: "current" | "purchase") =>
      request<Record<string, unknown>>(
        `/commercial-properties/${propertyId}/annual-snapshot-preview${valuationBasis ? `?valuationBasis=${valuationBasis}` : ""}`
      ),
    saveAnnualSnapshot: (propertyId: string, data: Record<string, unknown>) =>
      request<AnnualPropertySnapshot>(`/commercial-properties/${propertyId}/annual-snapshots`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateAnnualSnapshot: (id: string, data: Record<string, unknown>) =>
      request<AnnualPropertySnapshot>(`/commercial-properties/annual-snapshots/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    removeAnnualSnapshot: (id: string) =>
      request<void>(`/commercial-properties/annual-snapshots/${id}`, { method: "DELETE" }),
  },
};
