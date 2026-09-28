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
  /** Never the number itself — only whether one exists and its last digits. */
  hasTfn?: boolean;
  tfnMasked?: string | null;
  acn?: string | null;
  establishmentDate?: string | null;
  ownershipInfo?: string | null;
  contactInfo?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number; assets: number; liabilities: number };
  /** Set when this is a person's own personal entity. */
  personalFor?: { id: string; name: string } | null;
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
  taxRecords?: TaxRecord[];
  financialPosition?: {
    byAssetType: Record<string, number>;
    cash: number;
    totalAssets: number;
    totalLiabilities: number;
    netAssets: number;
    formula?: string;
    unitHoldings?: Array<{ trustId: string; trustName: string; percent: number; value: number }>;
    sharedItems?: number;
  };
  sharedAssets?: Array<Asset & { sharePercent: number; property?: { id: string } | null; commercialProperty?: { id: string } | null }>;
  sharedLiabilities?: Array<Liability & { sharePercent: number }>;
  unitholders?: Array<{
    id: string;
    fromEntityId: string;
    ownershipPercent: number | null;
    fromEntity: { id: string; name: string; personalFor: { id: string; name: string } | null };
  }>;
  heldForLoans?: Array<{ id: string; name: string; entity: { id: string; name: string } }>;
}

export interface Person {
  id: string;
  name: string;
  /** Income a year before tax; variable = bonus, overtime, commission. */
  grossSalary?: number | null;
  variableIncome?: number | null;
  occupation?: string | null;
  occupationGuide?: string | null;
  /** Parts of the app switched off for this person only (a JSON list of ids). */
  featuresOff?: string | null;
  employer?: string | null;
  employmentType?: string | null;
  carAllowance?: number | null;
  benefits?: string | null;
  dateOfBirth?: string | null;
  hasTfn?: boolean;
  tfnMasked?: string | null;
  contactInfo?: string | null;
  notes?: string | null;
  payFrequency?: string | null;
  phone?: string | null;
  email?: string | null;
  currentAddress?: string | null;
  previousAddress?: string | null;
  maritalStatus?: string | null;
  hasMotherMaidenName?: boolean;
  motherMaidenNameMasked?: string | null;
  nextOfKinName?: string | null;
  nextOfKinRelationship?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinAddress?: string | null;
  /** Their own personal (individual) entity, created with them. */
  entityId?: string | null;
  personalEntity?: Entity | null;
  entityRelationships?: PersonEntityRelationship[];
  familyFrom?: Array<{ id: string; relationshipType: string; toPersonId: string; toPerson: { id: string; name: string } }>;
  familyTo?: Array<{ id: string; relationshipType: string; fromPersonId: string; fromPerson: { id: string; name: string } }>;
  documents?: Document[];
  createdAt: string;
  updatedAt: string;
}

export interface Adviser {
  id: string;
  kind: string;
  firm?: string | null;
  contactFirstName?: string | null;
  contactSurname?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FamilySuggestion {
  personId: string;
  name: string;
  relation: "PARTNER" | "CHILD";
}

export interface IdentityRecord {
  id: string;
  personId: string;
  kind: string;
  label?: string | null;
  issuer?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  numberMasked: string | null;
  referenceMasked: string | null;
  documentCount?: number;
}

export interface InsurancePolicy {
  id: string;
  kind: string;
  insurer?: string | null;
  coverAmount?: number | null;
  premium?: number | null;
  premiumFrequency?: "MONTHLY" | "QUARTERLY" | "ANNUALLY" | null;
  renewalDate?: string | null;
  assetId?: string | null;
  asset?: { id: string; name: string; property?: { id: string } | null; commercialProperty?: { id: string } | null } | null;
  personId?: string | null;
  person?: { id: string; name: string } | null;
  entityId?: string | null;
  entity?: { id: string; name: string } | null;
  heldInSuper: boolean;
  notes?: string | null;
  policyNumberMasked: string | null;
  documentCount: number;
}

export interface EstateDocument {
  id: string;
  personId: string;
  kind: string;
  signedDate?: string | null;
  expiryDate?: string | null;
  reviewDate?: string | null;
  heldBy?: string | null;
  fundEntityId?: string | null;
  fund?: { id: string; name: string } | null;
  notes?: string | null;
  documentCount?: number;
}

export interface CalendarEvent {
  id: string;
  date: string;
  category: "ID" | "RENEWAL" | "VEHICLE" | "WARRANTY" | "SERVICE" | "LEASE" | "LOAN" | "SMSF" | "INSURANCE" | "ESTATE" | "REFERENCE" | "REMINDER";
  title: string;
  detail: string | null;
  route: string;
}

/** A date in the calendar, done like a task: open until marked complete. */
export interface CalendarTask extends CalendarEvent {
  key: string;
  done: boolean;
  doneAt: string | null;
  doneNote: string | null;
  reminderId: string | null;
  repeat: string | null;
  canRollForward: boolean;
}

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string;
  repeat: "NONE" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  targetType: string | null;
  targetId: string | null;
  completedAt: string | null;
  completeNote: string | null;
  target: { name: string; route: string } | null;
  fileCount: number;
}

export interface VehicleLogbook {
  id: string;
  assetId: string;
  startDate: string;
  endDate: string;
  startOdometer: number | null;
  endOdometer: number | null;
  totalKm: number;
  businessKm: number;
  documentId: string | null;
  document: { id: string; originalFilename: string } | null;
  notes: string | null;
}

export interface VehicleYearRecord {
  fyLabel: string;
  openingOdometer: number | null;
  closingOdometer: number | null;
  fuel: number | null;
  registration: number | null;
  insurance: number | null;
  repairs: number | null;
  interest: number | null;
  leasePayments: number | null;
  other: number | null;
  declineInValue: number | null;
  businessPercent: number | null;
  notes: string | null;
}

export interface BusinessUseSchedule {
  asset: { id: string; name: string; vehicleType: string | null; registration: string | null; make: string | null; model: string | null; year: number | null };
  fy: string;
  period: { start: string; end: string };
  owner: { id: string; name: string; entityType: string; personId: string | null; personName: string | null };
  treatment: "LOGBOOK" | "COMPANY_TRUST" | "SUPER_FUND";
  treatmentTitle: string;
  treatmentExplain: string;
  logbook: null | {
    id: string;
    startDate: string;
    endDate: string;
    totalKm: number;
    businessKm: number;
    percent: number | null;
    validUntilFy: string;
    document: { id: string; originalFilename: string } | null;
  };
  year: VehicleYearRecord | null;
  km: number | null;
  businessKm: number | null;
  businessPercent: number | null;
  workedDecline: { amount: number; base: number; capped: boolean } | null;
  costs: Array<{ key: string; label: string; amount: number }>;
  totalCosts: number;
  claim: number;
  fbt: null | { privatePercent: number; operatingCostTaxable: number; statutoryBase: number; statutoryTaxable: number };
  warnings: string[];
  notes: string[];
}

export interface ReferenceDownloadStatus {
  running: { startedAt: string; done: number; current: string; error?: string } | null;
  last: null | {
    folder: string;
    zip: string | null;
    savedAt: string;
    documents: number;
    changed: number;
    sources: number;
    occupationGuides: number;
    failed: Array<{ title: string; url: string; reason: string }>;
  };
}

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  date: string;
  kind: string;
  description: string;
  cost?: number | null;
  provider?: string | null;
  nextDueDate?: string | null;
  notes?: string | null;
}

export interface ItemNode {
  id: string;
  name: string;
  itemCategory: string | null;
  make: string | null;
  model: string | null;
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  warrantyExpiry: string | null;
  maintenanceCost: number;
  lifetimeCost: number;
  lastServiced: string | null;
  nextDue: string | null;
  documentCount: number;
  children: ItemNode[];
}

export interface PayPeriodEntry {
  id: string;
  personId: string;
  periodStart: string;
  periodEnd: string;
  status: "LOGGED" | "NON_WORKING";
  documentId?: string | null;
  document?: Document | null;
  amount?: number | null;
  /** Payday super: whether the super for this pay arrived in the fund. */
  superPaid?: boolean | null;
  notes?: string | null;
  createdAt: string;
}

export interface PayPeriod {
  periodStart: string;
  periodEnd: string;
  status: "LOGGED" | "NON_WORKING" | "MISSING" | "PENDING";
  entry: PayPeriodEntry | null;
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

export type LoanUse = "PROPERTY" | "SHARES" | "BUSINESS" | "PRIVATE" | "OTHER";

export interface LoanPurpose {
  id: string;
  liabilityId: string;
  date: string | null;
  amount: number;
  use: LoanUse;
  deductible: boolean;
  assetId: string | null;
  asset?: { id: string; name: string } | null;
  description: string;
  /** A redraw or increase: what was owed just before it. */
  balanceBefore?: number | null;
  documentId: string | null;
  document?: { id: string; originalFilename: string } | null;
  notes: string | null;
}

export interface LoanInterestYear {
  id: string;
  liabilityId: string;
  fyLabel: string;
  interestCharged: number;
  documentId: string | null;
  document?: { id: string; originalFilename: string } | null;
  notes: string | null;
}

export interface PurposeSplit {
  total: number;
  deductible: number;
  private: number;
  deductibleShare: number | null;
  byUse: Array<{ purposeId: string; assetId: string | null; description: string; amount: number; share: number }>;
}

export interface LoanAllocation {
  purposes: LoanPurpose[];
  interestYears: LoanInterestYear[];
  split: PurposeSplit;
  uses: LoanUse[];
  /** Claims (uses and interest years) that already have a reason recorded. */
  reasonsFor: string[];
  /** Mixed purpose, or a split-loan arrangement worth a word with the accountant. */
  flags: string[];
}

export interface EquityDrawPreview {
  mode: "NEW_SPLIT" | "EXISTING_LOAN";
  loanName: string;
  facility: string | null;
  resultShare: number | null;
  usableEquity: number | null;
  securedLoans: Array<{ id: string; name: string; currentBalance: number | null; facility: string | null }>;
  warnings: string[];
}

export interface InterestScheduleRow {
  liabilityId: string;
  loanName: string;
  facility: string | null;
  lender: string | null;
  interestCharged: number;
  statementDocumentId: string | null;
  deductibleShare: number | null;
  deductibleInterest: number;
  privateInterest: number;
  byUse: Array<{ description: string; assetId: string | null; assetName: string | null; interest: number }>;
  owners: Array<{ entityId: string; entityName: string; share: number; deductibleInterest: number }>;
  notes: string[];
}

export interface UsableEquity {
  loans: Array<{ id: string; name: string; currentBalance: number | null }>;
  equity: { value: number; maxLvr: number; maxLvrAssumed: boolean; limit: number; owing: number; usable: number } | null;
}

export type ClaimTargetType = "LOAN_PURPOSE" | "LOAN_INTEREST_YEAR" | "WORK_DEDUCTION";

export interface ClaimNote {
  id: string;
  targetType: ClaimTargetType;
  targetId: string;
  reason: string;
  referenceDocumentId: string | null;
  referenceDocument?: { id: string; originalFilename: string; referenceCode: string | null; referenceCheckBy: string | null } | null;
  referencePinpoint: string | null;
  accountantNote: string | null;
  accountantAgreedOn: string | null;
  updatedAt: string;
}

export interface ClaimView {
  target: { title: string; lines: string[]; evidenceIds: string[] };
  note: ClaimNote | null;
  evidence: Array<{ id: string; originalFilename: string; documentType: string | null }>;
  history: Array<{ id: string; action: string; timestamp: string }>;
  referenceOverdue: boolean;
  referenceWithdrawn: string | null;
  newerReferenceId: string | null;
}

export interface PropertyProfitRow {
  assetId: string;
  kind: "PROPERTY" | "COMMERCIAL_PROPERTY";
  recordId: string;
  name: string;
  value: number | null;
  rent: number;
  runningCosts: number;
  costBreakdown: Array<{ label: string; amount: number }>;
  landTax: { amount: number | null; basis: string; notes: string[] };
  netIncome: number;
  interest: number;
  interestBasis: "DEBT_ALLOCATION" | "ESTIMATE" | "NONE";
  interestYear: string | null;
  cashBeforeTax: number;
  depreciation: number;
  capitalWorks: number;
  use: string | null;
  /** The share of its costs that relates to renting (0-1). */
  rentedShare: number;
  deductions: number;
  taxResult: number;
  owners: Array<{ entityId: string; entityName: string; share: number; taxResult: number; taxEffect: number | null; note: string | null }>;
  cashAfterTax: number | null;
  grossYield: number | null;
  netYield: number | null;
  afterTaxYield: number | null;
  notes: string[];
}

export interface BorrowingAssumptions {
  newLoanRate: number;
  buffer: number;
  floorRate: number;
  newLoanTermYears: number;
  existingTermYears: number;
  variableShading: [number, number];
  rentShading: [number, number];
  cardPercent: [number, number];
  declaredExpenses: number | null;
  benchmarkExpenses: number | null;
  residentialLvr: number;
  commercialLvr: [number, number];
  smsfLvr: [number, number];
  commercialIcr: [number, number];
  commercialBuffer: number;
}

export interface BorrowingScenario {
  label: string;
  assessmentRate: number;
  grossIncome: number;
  countedIncome: number;
  tax: number;
  netIncomeMonthly: number;
  expensesMonthly: number;
  commitmentsMonthly: number;
  commitments: Array<{ name: string; monthly: number; how: string }>;
  surplusMonthly: number;
  maxNewLoan: number;
}

export interface BorrowingEstimate {
  assumptions: BorrowingAssumptions;
  incomes: Array<{ name: string; salary: number; variable: number; rent: number }>;
  debts: Array<{ name: string; balance: number; ratePct: number | null; remainingYears: number | null; cardLimit: number | null }>;
  residential: {
    scenarios: [BorrowingScenario, BorrowingScenario];
    totalIncome: number;
    existingDebt: number;
    dtiLimitLoan: number;
    dtiWarning: string | null;
    notes: string[];
  };
  equity: { properties: Array<{ name: string; value: number; lvr: number; owing: number; usable: number }>; usableTotal: number; release: [number, number] };
  propertyLoans: Array<{
    recordId: string;
    kind: "SMSF" | "COMMERCIAL";
    name: string;
    assessmentRate: number;
    range: Array<{ label: string; byServicing: number; byLvr: number | null; total: number; release: number }>;
    notes: string[];
  }>;
}

export interface WorkDeduction {
  id: string;
  personId: string;
  fyLabel: string;
  category: string;
  description: string;
  amount: number;
  method: string | null;
  quantity: number | null;
  documentId: string | null;
  document?: { id: string; originalFilename: string } | null;
  notes: string | null;
}

export interface IncomeStatement {
  id: string;
  fyLabel: string;
  employer: string | null;
  grossPayments: number;
  taxWithheld: number | null;
  allowances: number | null;
  reportableFringeBenefits: number | null;
  reportableSuper: number | null;
  lumpSums: number | null;
  documentId: string | null;
  document?: { id: string; originalFilename: string } | null;
}

export interface OccupationGuideSummary {
  key: string;
  title: string;
  updated: string | null;
  items: number;
}

export interface ChecklistItem {
  key: string;
  name: string;
  verdict: "CAN" | "CANT" | "DEPENDS";
  can: string[];
  cant: string[];
  text: string;
  category: string;
  choice: "CLAIM" | "NOT_FOR_ME" | null;
  claims: Array<{ id: string; amount: number; description: string; hasRecord: boolean }>;
  total: number;
}

export interface OccupationChecklist {
  fy: string;
  guide: { key: string; title: string; url: string | null; updated: string | null; source: "SHIPPED" | "LIBRARY"; documentId: string | null } | null;
  chosen: string | null;
  suggested: string | null;
  suggestedTitle: string | null;
  items?: ChecklistItem[];
  summary?: { claimed: number; recorded: number; toRecord: number; withoutRecord: number };
}

export interface PaygView {
  fy: string;
  categories: Array<{ key: string; label: string; canClaim: string; records: string; source: string; claimed: boolean }>;
  deductions: WorkDeduction[];
  total: number;
  estimatedTaxSaved: number | null;
  rates: { carCentsPerKm: number; carRateYear: string; carKmCap: number; wfhPerHour: number; wfhRateYear: string; immediateLimit: number };
  incomeStatements: IncomeStatement[];
  checks: string[];
  reasonsFor: string[];
}

export interface CarOption {
  key: string;
  label: string;
  totalCosts: number;
  preTax: number;
  postTax: number;
  taxChange: number;
  netCost: number;
  salaryReduction: number;
  workings: string[];
  notes: string[];
}

export interface Expectation {
  key: string;
  kind: "INSURANCE" | "DOCUMENT" | "RECORD";
  label: string;
  level: "RED" | "AMBER";
  why: string;
  fyLabel: string | null;
  met: boolean;
  metBy: { label: string; route: string } | null;
  addAs: string;
  dismissed: { reason: string; at: string } | null;
}

export interface ExpectationGroup {
  target: string;
  kind: "PROPERTY" | "COMMERCIAL_PROPERTY" | "VEHICLE" | "PERSON" | "ENTITY";
  name: string;
  route: string;
  items: Expectation[];
}

export interface ExpectedResult {
  fyLabel: string;
  fyOptions: string[];
  groups: ExpectationGroup[];
  counts: { red: number; amber: number; met: number; setAside: number };
}

export interface MirrorStatus {
  folder: string | null;
  enabled: boolean;
  custom: boolean;
  last: { at: string; folder: string; files: number; written: number; removed: number; problems: string[]; recordsBackup: string | null } | null;
}

export interface LoanReading {
  id: string;
  liabilityId: string;
  asAt: string;
  interestRate: number | null;
  balance: number | null;
  repayment: number | null;
  repaymentFrequency: string | null;
  /** STATEMENT | CSV | RATE_CHANGE | RECORDED | EDITED */
  source: string;
  documentId: string | null;
  document?: { id: string; originalFilename: string } | null;
  note: string | null;
}

export interface LoanHistory {
  readings: LoanReading[];
  current: { asAt: string; interestRate: number | null; balance: number | null; repayment: number | null; repaymentFrequency: string | null };
  interestYears: Array<{ fyLabel: string; interestCharged: number; documentId: string | null }>;
}

export interface StatementFigures {
  periodStart: string | null;
  periodEnd: string | null;
  asAt: string | null;
  balance: number | null;
  interestRate: number | null;
  repayment: number | null;
  repaymentFrequency: string | null;
  interestCharged: number | null;
  financialYear: { fyLabel: string; interest: number } | null;
  rateChanges: Array<{ date: string; rate: number }>;
  found: string[];
}

export interface StatementProposal {
  kind: "STATEMENT" | "CSV";
  statement?: StatementFigures;
  csv?: { asAt: string | null; balance: number | null; interestByYear: Array<{ fyLabel: string; interest: number; complete: boolean }>; rows: number; found: string[] };
  current: { balance: number | null; balanceAsAt: string | null; interestRate: number | null; repayment: number | null; repaymentFrequency: string | null };
  recordedYears: Record<string, number>;
}

/** Automatic updates for the installed program, from the project's GitHub releases. */
export interface OnlineUpdate {
  enabled: boolean;
  autoCheck: boolean;
  checkedAt: string | null;
  error: string | null;
  available: { version: string; notes: string | null; size: number; releaseUrl: string | null } | null;
  /** A newer version, and "Later" hasn't been pressed for it. */
  remind: boolean;
  job:
    | { state: "idle" | "checking" | "installing" }
    | { state: "downloading"; received: number; total: number }
    | { state: "failed"; error: string };
}

export interface AppInfo {
  version: string;
  dataFolder: string | null;
  canUpdate: boolean;
  installed?: boolean;
  supervised: boolean;
  previousVersion: string | null;
  lastUpdate: {
    kind: "UPDATED" | "FAILED" | "ROLLED_BACK";
    from: string;
    to: string;
    notes?: string | null;
    error?: string;
    at: string;
    seen: boolean;
  } | null;
}

export interface ChecklistItem {
  id: string;
  title: string;
  why: string;
  rule: string;
  risk: "SETTLED" | "ARGUABLE" | "ATO_TARGETED";
  source: { label: string; referenceCode?: string };
  action: string;
  link: string | null;
  facts?: string[];
}

export interface StructureOption {
  key: string;
  label: string;
  available: boolean;
  landTax: number;
  interest: number;
  taxResult: number;
  yearlyTax: number;
  yearlyCashAfterTax: number;
  saleGain: number;
  saleTax: number;
  overallAfterTax: number;
  good: string[];
  watch: string[];
  sources: string[];
}

export type ReferenceCheckStatus = "CURRENT" | "UPDATED" | "NEW_YEAR" | "WITHDRAWN" | "BROKEN" | "FAILED" | "NOT_YET";

export interface ReferenceChecks {
  lastCheckedAt: string | null;
  items: Array<{
    linkId: string;
    title: string;
    publisher: string;
    kind: string;
    url: string;
    status: ReferenceCheckStatus | null;
    message: string | null;
    checkedAt: string | null;
    documentId: string | null;
    searchUrl: string | null;
    claimsCiting: number;
  }>;
}

export interface ReferenceFigures {
  checkedOn: string;
  items: Array<{
    id: string;
    label: string;
    value: string;
    source: string;
    sourceCheckedAt: string | null;
    sourceStatus: ReferenceCheckStatus | null;
    sourceDocumentId: string | null;
    review: boolean;
  }>;
}

export interface ReferenceLibraryStatus {
  available: boolean;
  items: Array<{ file: string; title: string; referenceCode: string | null; url: string | null; documentId: string | null }>;
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
  textExtractionEnabled: boolean;
  aiSummary?: string | null;
  tags?: string | null;
  notes?: string | null;
  retentionDate?: string | null;
  reviewStatus: string;
  renewalDate?: string | null;
  /** Tax references only: the ruling or guide code, and when to check it's current. */
  referenceCode?: string | null;
  referenceCheckBy?: string | null;
  referenceLinkId?: string | null;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
  supersededAt?: string | null;
  /** The publisher's own "Last updated" date, and the library folder it sits in. */
  sourceUpdatedAt?: string | null;
  referenceFolder?: string | null;
  withdrawnNote?: string | null;
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

export interface AcquisitionInputs {
  purchasePrice: number;
  acquisitionCosts: number;
  lvr: number;
  rent: number;
  occupancy: number;
  fixedIncome: number;
  expenses: number;
  interestRate: number;
  repaymentType: "IO" | "PI";
  loanTermYears: number;
}

export interface AcquisitionFigures {
  totalAcquisitionCost: number;
  requiredEquity: number;
  loan: number;
  lvr: number;
  grossIncome: number;
  noi: number;
  grossYield: number | null;
  netYield: number | null;
  capRate: number | null;
  interestExpense: number;
  annualDebtService: number;
  cashFlowAfterFinancing: number;
  equity: number;
  dscr: number | null;
  interestCoverage: number | null;
  breakEvenOccupancy: number | null;
}

export interface AssessmentInputs {
  price?: number | null;
  lvrPercent?: number | null;
  stampDuty?: number | null;
  otherCosts?: number | null;
  repaymentType?: "IO" | "PI";
  loanTermYears?: number | null;
  advertisedYieldPercent?: number | null;
  expectedVacancyWeeks?: number | null;
  expectedRatePercent?: number | null;
  conservativeRent?: number | null;
  conservativeVacancyWeeks?: number | null;
  conservativeCosts?: number | null;
  conservativeRatePercent?: number | null;
  badRent?: number | null;
  badVacancyWeeks?: number | null;
  badCosts?: number | null;
  badRatePercent?: number | null;
}

export interface AssessmentColumn {
  key: "expected" | "conservative" | "bad";
  label: string;
  inputs: { rent: number | null; vacancyWeeks: number; costs: number | null; ratePercent: number | null };
  figures: {
    grossYield: number | null;
    netYield: number | null;
    netIncome: number | null;
    interest: number | null;
    repayments: number | null;
    cashBeforeTax: number | null;
    taxResult: number | null;
    taxEffect: number | null;
    cashAfterTax: number | null;
    weeklyCash: number | null;
    returnOnCash: number | null;
    dscr: number | null;
  };
  missing: string[];
  shown: boolean;
}

export interface Assessment {
  assetId: string;
  kind: "RESIDENTIAL" | "COMMERCIAL";
  inputs: (AssessmentInputs & { frozenAt?: string | null }) | null;
  price: number | null;
  priceIsAsking: boolean;
  purchase: {
    deposit: number | null;
    stampDuty: number | null;
    dutyEstimated: boolean;
    dutyRatesYear: string | null;
    otherCosts: number;
    openIssueCosts: number;
    cashNeeded: number | null;
    loan: number | null;
    lvr: number | null;
    repaymentType: "IO" | "PI";
    loanTermYears: number;
  };
  expectedFrom: { rent: number | null; costs: number | null; costBreakdown: Array<{ label: string; amount: number }> };
  columns: AssessmentColumn[];
  borrowing: null | { people: string[]; capacity: [number, number]; status: string | null; reason: string | null; notes: string[] };
  advertisedYield: number | null;
  supportedYield: number | null;
  notes: string[];
}

export interface DueDiligenceCheckView {
  key: string;
  kind: "CHECK" | "ISSUE" | "DEVELOPMENT";
  group: string | null;
  label: string;
  why: string | null;
  own: boolean;
  id: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NA";
  findings: string | null;
  cost: number | null;
  who: string | null;
  dueDate: string | null;
  checked: boolean;
  problem: boolean;
  resolvedAt: string | null;
  resolution: string | null;
  evidence: number;
  approved?: boolean;
}

export interface DueDiligence {
  kind: "RESIDENTIAL" | "COMMERCIAL";
  propertyKind: string | null;
  titleType: string | null;
  groups: Array<{ name: string; checks: DueDiligenceCheckView[]; done: number; total: number }>;
  openIssues: DueDiligenceCheckView[];
  resolvedIssues: DueDiligenceCheckView[];
  openIssueCosts: number;
  development: DueDiligenceCheckView[];
  totals: { done: number; total: number };
}

export type CheckUpdate = Partial<{
  status: DueDiligenceCheckView["status"];
  findings: string | null;
  cost: number | null;
  who: string | null;
  dueDate: string | null;
  checked: boolean;
  problem: boolean;
  resolved: boolean;
  resolution: string | null;
  label: string;
}>;

export interface ConsideredProperty {
  assetId: string;
  id: string;
  kind: "RESIDENTIAL" | "COMMERCIAL";
  route: string;
  name: string;
  address: string;
  suburb: string | null;
  askingPrice: number | null;
  stage: string;
  status: "CONSIDERING" | "PASSED_ON";
  passedOnAt: string | null;
  passedOnReason: string | null;
  owner: string;
  grossYield: number | null;
  yearlyRent: number | null;
  /** The assessment's expected column, once filled in. */
  expected?: { grossYield: number | null; netYield: number | null; weeklyCash: number | null; afterTax: boolean } | null;
}

export interface GettingStartedStep {
  key: string;
  label: string;
  explain: string;
  buttons: Array<{ label: string; route: string }>;
  done: boolean;
  skipped: boolean;
}

export interface DashboardSummary {
  backup: { lastBackupAt: string | null; remindAfterDays: number };
  staleValues: Array<{ id: string; name: string; value: number | null; since: string; route: string }>;
  missing: { red: number; amber: number; met: number; setAside: number; fyLabel: string } | null;
  referenceCheck: { due: boolean; lastCheckedAt: string | null } | null;
  gettingStarted: {
    steps: GettingStartedStep[];
    dismissed: boolean;
    complete: boolean;
  };
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
  upcomingLeaseEvents: Array<{
    tenancyId: string;
    tenantName: string;
    commercialPropertyId: string;
    commercialPropertyName: string;
    eventType: "EXPIRY" | "RENT_REVIEW";
    eventDate: string;
  }>;
}

export interface Settings {
  id: number;
  allowExternalAiProcessing: boolean;
  defaultLandingPage: string;
  customStorageDir?: string | null;
  effectiveStorageDir: string;
  allowPriceLookups: boolean;
  lastBackupAt?: string | null;
  checklistDismissed?: boolean;
  setupHaveDone?: boolean;
  setupSkipped?: string[];
  featuresOff: string[];
}

export interface PropertyPerformanceRow {
  id: string;
  name: string;
  address: string;
  entityName: string;
  purchasePrice: number | null;
  currentValue: number | null;
  debt: number;
  equity: number | null;
  grossRent: number;
  expenses: number;
  interest: number;
  netCashFlow: number;
  estimatedYield: number | null;
}

export interface InvestmentPortfolioRow {
  id: string;
  institution: string;
  entityName: string;
  accountType: string;
  holdingCount: number;
  costBase: number;
  marketValue: number;
  unrealisedGain: number | null;
  unpricedCount: number;
  realisedNetGain: number;
  frankingCredits: number;
}

export interface CapitalGainsReport {
  financialYear: FinancialYear;
  rows: Array<{
    id: string;
    disposalDate: string;
    code: string;
    entityName: string;
    entityType: string;
    quantity: number;
    proceeds: number;
    costBase: number;
    grossGain: number;
    discount: "YES" | "NO" | "PART" | "NONE";
    kind?: "SHARES" | "ASSET";
    exemptPortion?: number;
    notes?: string[];
    parcels: Array<{ acquisitionDate: string | null; quantity: number; costBase: number; grossGain: number; discountEligible: boolean }>;
  }>;
  byEntity: Array<{
    entityId: string;
    entityName: string;
    entityType: string;
    discountRate: number;
    disposalCount: number;
    totalGains: number;
    totalLosses: number;
    lossesApplied: number;
    discountAmount: number;
    netCapitalGain: number;
    lossCarriedForward: number;
  }>;
  dividends: Array<{
    id: string;
    paymentDate: string;
    code: string;
    entityName: string;
    frankedAmount: number;
    unfrankedAmount: number;
    frankingCredit: number;
  }>;
  totals: {
    disposalCount: number;
    totalProceeds: number;
    totalCostBase: number;
    totalGrossGains: number;
    totalLosses: number;
    totalDiscount: number;
    netCapitalGain: number;
    lossCarriedForward: number;
    dividendIncome: number;
    frankingCredits: number;
  };
  note: string;
}

export interface TaxSummaryRow {
  entityId: string;
  entityName: string;
  income: number;
  expenses: number;
  capitalGains: number;
  capitalLosses: number;
  needsReview: number;
  /** Net capital gain worked out from recorded share/ETF/crypto sales. */
  calculatedCapitalGain: number;
}

export interface DebtSummaryRow {
  id: string;
  name: string;
  liabilityType: string;
  entityName: string;
  lender?: string | null;
  currentBalance: number | null;
  creditLimit: number | null;
  interestRate: number | null;
  repaymentAmount: number | null;
  repaymentFrequency: string | null;
  monthlyRepayment: number | null;
  securedAsset: string | null;
  lvr: number | null;
  offsetBalance: number;
  netOfOffset: number | null;
  interestSavedPerYear: number;
}

export interface IncomeSpending {
  from: string;
  to: string;
  accounts: Array<{ id: string; name: string }>;
  months: Array<{ month: string; moneyIn: number; moneyOut: number; net: number }>;
  monthsCovered: number;
  averageMonthlyIn: number;
  averageMonthlyOut: number;
  averageMonthlyNet: number;
  byCategory: Array<{ name: string; group: string; moneyIn: number; moneyOut: number }>;
  transfersLeftOut: number;
  note: string;
}

export interface DebtSummary {
  rows: DebtSummaryRow[];
  totalDebt: number;
  totalCreditLimits: number;
  cardsWithoutLimit: number;
  totalMonthlyRepayments: number;
  totalOffset: number;
  totalInterestSavedPerYear: number;
  loansWithoutRepayment: number;
  formula: string;
}

export interface TaxRecord {
  id: string;
  financialYearId: string;
  financialYear?: FinancialYear;
  entityId: string;
  entity?: Entity;
  recordType: string;
  description: string;
  amount?: number | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NetWorthBreakdown {
  cash: number;
  propertyValue: number;
  investmentValue: number;
  superValue: number;
  vehicleValue: number;
  otherAssets: number;
  totalAssets: number;
  mortgages: number;
  creditCards: number;
  personalLoans: number;
  vehicleLoans: number;
  otherLiabilities: number;
  totalLiabilities: number;
  netPosition: number;
}

export interface NetWorthSnapshot extends NetWorthBreakdown {
  id: string;
  asAtDate: string;
  entityId?: string | null;
  entity?: Entity | null;
  notes?: string | null;
  createdAt: string;
}

export interface GraphNode {
  id: string;
  type: "PERSON" | "ENTITY" | "ASSET" | "ACCOUNT" | "INVESTMENT" | "LIABILITY";
  label: string;
  sublabel?: string;
  value?: number | null;
  route?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Asset {
  id: string;
  name: string;
  assetType: string;
  entityId: string;
  /** OWNED | CONSIDERING | PASSED_ON — only owned ones count anywhere. */
  status?: string;
  pipelineStage?: string | null;
  askingPrice?: number | null;
  passedOnAt?: string | null;
  passedOnReason?: string | null;
  entity?: Entity;
  acquisitionDate?: string | null;
  acquisitionCost?: number | null;
  currentValue?: number | null;
  valuationDate?: string | null;
  disposalDate?: string | null;
  disposalValue?: number | null;
  buyingCosts?: number | null;
  improvementsCost?: number | null;
  capitalWorksClaimed?: number | null;
  lenderMaxLvr?: number | null;
  landValue?: number | null;
  landTaxPerYear?: number | null;
  ownershipReason?: string | null;
  depreciationPerYear?: number | null;
  capitalWorksPerYear?: number | null;
  sellingCosts?: number | null;
  mainResidence?: "NONE" | "FULL" | "PARTIAL" | null;
  mainResidencePercent?: number | null;
  notes?: string | null;
  vehicleType?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  registration?: string | null;
  registrationExpiry?: string | null;
  identifier?: string | null;
  securedLoans?: Liability[];
  parentAssetId?: string | null;
  parent?: { id: string; name: string; assetType: string; property?: { id: string } | null; commercialProperty?: { id: string } | null } | null;
  itemCategory?: string | null;
  warrantyExpiry?: string | null;
  maintenance?: MaintenanceRecord[];
  items?: ItemNode[];
  lifetimeCost?: number;
  commercialProperty?: { id: string; name: string } | null;
  property?: Property | null;
  documents?: Document[];
  ownerships?: AssetOwnership[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetOwnership {
  id: string;
  assetId: string;
  ownerEntityId: string;
  ownerEntity?: Entity;
  ownershipPercent: number;
  ownershipType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface AssetSale {
  cgtApplies: boolean;
  rows: Array<{
    entityId: string;
    entityName: string;
    share: number;
    proceeds: number;
    costBase: number;
    exemptPortion: number;
    grossGain: number;
    discountEligible: boolean;
    notes: string[];
  }>;
  openLoans: Array<{ id: string; name: string; currentBalance: number | null }>;
}

// --- Asset tree ---------------------------------------------------------------

export interface TreeNode {
  id: string;
  kind: "ASSET" | "ITEM" | "LOAN" | "ACCOUNT" | "INVESTMENT" | "POLICY" | "GROUP" | "ENTITY_REF";
  label: string;
  sublabel?: string | null;
  value?: number | null;
  sign?: 1 | -1;
  route?: string;
  badges?: string[];
  entityId?: string;
  children: TreeNode[];
}

export interface AssetTreeData {
  people: Array<{
    id: string;
    name: string;
    route: string;
    value: number;
    ownEntityId: string | null;
    ownPolicies: TreeNode[];
    structures: Array<{ entityId: string; roles: string[] }>;
  }>;
  entities: Record<string, { id: string; name: string; type: string; value: number; route: string; children: TreeNode[] }>;
  unlinked: string[];
  familyNet: number;
}

// --- Self-managed super funds ------------------------------------------------

export interface CapStatusNotes {
  notes: string[];
}

export interface SmsfContribution {
  id: string;
  fundId: string;
  personId: string;
  date: string;
  amount: number;
  source: string;
  kind: "CONCESSIONAL" | "NON_CONCESSIONAL" | "EXCLUDED";
  otherFund: string | null;
  notes?: string | null;
}

export interface SmsfMemberYear {
  id: string;
  personId: string;
  fyLabel: string;
  closingBalance: number;
  taxFreeComponent: number | null;
  totalSuperBalance: number | null;
}

export interface SmsfMember {
  personId: string;
  name: string;
  dateOfBirth: string | null;
  age: number | null;
  isMember: boolean;
  isTrustee: boolean;
  isDirector: boolean;
  years: SmsfMemberYear[];
  latestBalance: SmsfMemberYear | null;
  contributions: SmsfContribution[];
  concessional: CapStatusNotes & { cap: number; carryForward: number; available: number; used: number; remaining: number };
  nonConcessional: CapStatusNotes & {
    annualCap: number;
    maxThisYear: number;
    bringForward: { startYear: string; years: number; total: number; usedBefore: number } | null;
    used: number;
    remaining: number;
  };
  transferBalance: { used: number; cap: number; capYear: string } | null;
  /** Division 296: over or near the $3m large super balance threshold. */
  largeBalance: { balance: number; threshold: number; level: "NEAR" | "OVER" | "VERY_LARGE"; note: string } | null;
}

export interface SmsfPensionView {
  id: string;
  personId: string;
  personName: string;
  kind: "ACCOUNT_BASED" | "TRANSITION_TO_RETIREMENT";
  startDate: string;
  startBalance: number;
  endDate: string | null;
  notes: string | null;
  openingBalance: number | null;
  paidThisYear: number;
  stillToPay: number | null;
  overMaximum: boolean;
  year: {
    active: boolean;
    basis: number | null;
    rate: number | null;
    minimum: number | null;
    maximum: number | null;
    retirementPhase: boolean;
    notes: string[];
  };
  paymentsThisYear: Array<{ id: string; date: string; amount: number; notes: string | null }>;
}

export interface SmsfLrba {
  id: string;
  name: string;
  lender: string | null;
  balance: number | null;
  interestRate: number | null;
  holdingTrust: { id: string; name: string } | null;
  property: { name: string; value: number | null; route: string; rentSource: string } | null;
  lvr: number | null;
  annualRent: number | null;
  annualRepayments: number | null;
  rentCover: number | null;
  startDate: string | null;
  /** New LRBAs from 10 August 2026 can't buy residential property. */
  propertyWarning: { level: "WARNING" | "CHECK"; note: string } | null;
}

export interface SmsfDetails {
  trusteeType: "INDIVIDUAL" | "CORPORATE" | null;
  corporateTrusteeId: string | null;
  corporateTrustee?: Entity | null;
  auditorName: string | null;
  auditorNumber: string | null;
  lodgedBy: "TAX_AGENT" | "SELF" | null;
  lastReturnLodged: string | null;
  returnDueDate: string | null;
  strategyReviewedOn: string | null;
  notes: string | null;
}

export interface SmsfOverview {
  fund: { id: string; name: string; abn: string | null; establishmentDate: string | null };
  year: string;
  years: string[];
  rules: { concessional: number; nonConcessional: number; transferBalanceCap: number; known: boolean };
  details: SmsfDetails | null;
  nextReturnYear: string;
  dates: Array<{ key: string; date: string; title: string; detail: string | null }>;
  checks: string[];
  members: SmsfMember[];
  pensions: SmsfPensionView[];
  pensionShare: { pensionBalances: number; fundBalance: number | null; share: number | null };
  lrba: SmsfLrba[];
  cash: number;
  contributionSources: string[];
}

export interface Property {
  id: string;
  assetId: string;
  asset?: Asset;
  entityId: string;
  entity?: Entity;
  address: string;
  state?: string | null;
  suburb?: string | null;
  kind?: string | null;
  titleType?: string | null;
  purchaseDate?: string | null;
  settlementDate?: string | null;
  purchasePrice?: number | null;
  ownershipPercent?: number | null;
  tenantInfo?: string | null;
  propertyManager?: string | null;
  weeklyRent?: number | null;
  use?: "HOME" | "INVESTMENT" | "HOLIDAY" | "HOLIDAY_RENTED" | "HOME_PART_RENTED" | null;
  /** Part rented, part private: the share of its costs that relates to renting (0-100). */
  rentedShare?: number | null;
  /** A holiday home also rented: whether it's mainly used to earn rent. */
  mainlyRented?: boolean | null;
  councilRates?: number | null;
  waterRates?: number | null;
  strataFees?: number | null;
  managementPercent?: number | null;
  repairsPerYear?: number | null;
  otherCostsPerYear?: number | null;
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
  /** Loan splits under one facility share this name. */
  facility?: string | null;
  entityId: string;
  entity?: Entity;
  lender?: string | null;
  originalAmount?: number | null;
  currentBalance?: number | null;
  /** The date currentBalance is for. */
  balanceAsAt?: string | null;
  interestRate?: number | null;
  loanType?: string | null;
  fixedPeriodEnds?: string | null;
  repaymentAmount?: number | null;
  maturityDate?: string | null;
  startDate?: string | null;
  securityPropertyId?: string | null;
  securityProperty?: Property | null;
  securityCommercialPropertyId?: string | null;
  securityCommercialProperty?: CommercialProperty | null;
  securityAssetId?: string | null;
  securityAsset?: Asset | null;
  creditLimit?: number | null;
  holdingTrustEntityId?: string | null;
  holdingTrust?: Entity | null;
  ownerships?: Array<{ id: string; ownerEntityId: string; ownerEntity?: Entity; ownershipPercent: number; notes?: string | null }>;
  offsetAccounts?: Array<{ id: string; institution: string; accountName: string; currentBalance: number | null }>;
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

export interface LeaseExtractionSuggestion {
  rentPerAnnum: number | null;
  leaseCommencement: string | null;
  leaseExpiry: string | null;
  reviewMechanism: string | null;
  confidence: "LOW" | "MEDIUM";
}

export interface LeaseExtractionResponse {
  found: boolean;
  suggestion: LeaseExtractionSuggestion | null;
  sourceDocument: { id: string; originalFilename: string } | null;
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
    loansAssumedInterestOnly: number;
    formula: { lvr: string; equity: string; estimatedAnnualInterest: string; annualDebtService: string };
  };
  cashFlowAfterFinancing: { value: number; status: string; formula: string };
  coverage: {
    dscr: number | null;
    interestCoverageRatio: number | null;
    formula: { dscr: string; interestCoverageRatio: string };
  };
}

export interface CommercialPortfolioRow {
  propertyId: string;
  name: string;
  propertyValue: number | null;
  debt: number;
  equity: number | null;
  noi: number;
  netYield: number | null;
  capRate: number | null;
  lvr: number | null;
  occupancyPercent: number | null;
  waleByRentYears: number | null;
}

export interface CommercialPortfolio {
  properties: CommercialPortfolioRow[];
  portfolio: {
    numberOfProperties: number;
    numberOfTenants: number;
    totalValue: number;
    totalDebt: number;
    totalEquity: number;
    weightedLvr: number | null;
    totalNoi: number;
    portfolioNetYield: number | null;
    totalAnnualRent: number;
    weightedOccupancy: number | null;
    weightedWaleByRentYears: number | null;
    totalAnnualInterest: number;
    cashFlowAfterFinancing: number;
  };
  note: string;
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
  suburb?: string | null;
  titleType?: string | null;
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

export interface Security {
  id: string;
  code: string;
  name?: string | null;
  assetClass: "SHARE" | "ETF" | "MANAGED_FUND" | "CRYPTO" | "SUPER" | "BOND" | "OTHER";
  exchange?: string | null;
  priceSource: "MANUAL" | "YAHOO" | "COINGECKO";
  providerSymbol?: string | null;
  currency: string;
  latestPrice?: number | null;
  priceDate?: string | null;
}

export interface InvestmentParcel {
  id: string;
  acquisitionDate: string;
  acquisitionType: string;
  quantity: number;
  remainingQuantity: number;
  unitPrice: number;
  brokerage: number;
  costBase: number;
  notes?: string | null;
}

export interface InvestmentPosition {
  securityId: string;
  security: Security;
  quantity: number;
  costBase: number;
  averageUnitCost: number;
  latestPrice: number | null;
  priceDate: string | null;
  priceSource: string | null;
  marketValue: number | null;
  unrealisedGain: number | null;
  discountEligibleQuantity: number;
  parcels: InvestmentParcel[];
}

export interface DisposalAllocationResult {
  parcelId: string;
  quantity: number;
  acquisitionDate: string;
  costBase: number;
  proceeds: number;
  grossGain: number;
  discountEligible: boolean;
  discountAmount: number;
  netGain: number;
}

export interface DisposalResult {
  proceeds: number;
  costBase: number;
  grossGain: number;
  discountAmount: number;
  netGain: number;
  allocations: DisposalAllocationResult[];
  unallocatedQuantity: number;
}

export interface InvestmentDisposal {
  id: string;
  securityId: string;
  security: Security;
  disposalDate: string;
  quantity: number;
  unitPrice: number;
  brokerage: number;
  method: string;
  financialYear?: FinancialYear | null;
  result: DisposalResult;
}

export interface InvestmentDividend {
  id: string;
  securityId: string;
  security: Security;
  paymentDate: string;
  frankedAmount: number;
  unfrankedAmount: number;
  frankingCredit: number;
  capitalGainsAmount: number;
  foreignIncome: number;
  foreignTaxCredit: number;
  reinvestedParcelId?: string | null;
  financialYear?: FinancialYear | null;
  notes?: string | null;
}

export interface DisposalPreview {
  available: number;
  entityType: string;
  allocations: Array<{ parcelId: string; quantity: number }>;
  result: DisposalResult;
  parcels: Array<{ id: string; acquisitionDate: string; remainingQuantity: number; unitPrice: number; costBase: number }>;
}

export interface PriceRefreshResult {
  updated: number;
  failures: Array<{ code: string; reason: string }>;
  note?: string;
}

export interface InvestmentAccount {
  id: string;
  institution: string;
  accountRef?: string | null;
  entityId: string;
  entity?: Entity;
  accountType: string;
  notes?: string | null;
  positions?: InvestmentPosition[];
  disposals?: InvestmentDisposal[];
  dividends?: InvestmentDividend[];
  totals?: {
    costBase: number;
    marketValue: number;
    unpricedCount: number;
    realisedNetGain: number;
    frankingCredits: number;
  };
  _count?: { parcels: number };
  documents?: Document[];
  realisedGainLoss?: number;
  createdAt: string;
  updatedAt: string;
  ownerships?: Array<{ id: string; ownerEntityId: string; ownerEntity?: Entity; ownershipPercent: number }>;
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
  offsetForLiabilityId?: string | null;
  offsetFor?: { id: string; name: string; currentBalance: number | null; interestRate: number | null } | null;
  ownerships?: Array<{ id: string; ownerEntityId: string; ownerEntity?: Entity; ownershipPercent: number }>;
  accountNumberMasked?: string | null;
}

export interface PackChip {
  key: string;
  label: string;
  count: number;
}

export interface PackPreview {
  categories: PackChip[];
  generated: PackChip[];
}

export interface CsvColumnMapping {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn?: number | null;
  debitColumn?: number | null;
  creditColumn?: number | null;
  dateFormat: "DMY" | "MDY" | "YMD";
  hasHeaderRow: boolean;
  invertSign?: boolean;
}

export interface CsvInspection {
  headers: string[] | null;
  sampleRows: string[][];
  totalRows: number;
  proposed: CsvColumnMapping;
}

export interface CsvPreview {
  totalParsed: number;
  duplicates: number;
  willImport: number;
  skipped: Array<{ line: number; reason: string; raw: string[] }>;
  preview: Array<{ date: string; description: string; amount: number; duplicate: boolean }>;
  dateRange: { from: string; to: string } | null;
}

export interface ImportBatch {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
}

export interface ImportBatchSummary extends ImportBatch {
  _count: { files: number };
}

export interface ImportBatchFile {
  id: string;
  batchId: string;
  originalFilename: string;
  relativePath?: string | null;
  status: "IMPORTED" | "DUPLICATE" | "FAILED";
  errorMessage?: string | null;
  documentId?: string | null;
  proposedDocumentType?: string | null;
  confidenceScore?: number | null;
}

export interface ImportGroup {
  key: string;
  documentType: string | null;
  folder: string | null;
  count: number;
  fileIds: string[];
  documentIds: string[];
  sampleFilenames: string[];
  filenameTemplates: string[];
  financialYearLabels: string[];
  averageConfidence: number | null;
}

export interface ImportBatchReview {
  batch: ImportBatch;
  totals: { imported: number; duplicates: number; failed: number };
  groups: ImportGroup[];
  failed: Array<{ id: string; originalFilename: string; errorMessage?: string | null }>;
  duplicates: Array<{ id: string; originalFilename: string }>;
}

export interface EmailImportRule {
  id: string;
  emailAccountId: string;
  name: string;
  gmailQuery: string;
  suggestedDocumentType?: string | null;
  suggestedEntityId?: string | null;
  suggestedEntity?: Entity | null;
  enabled: boolean;
  createdAt: string;
}

export interface EmailAccount {
  id: string;
  emailAddress: string;
  provider: string;
  hasAppPassword: boolean;
  enabled: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  rules: EmailImportRule[];
  createdAt: string;
}

export type EmailImportOutcome = "IMPORTED" | "DUPLICATE" | "SKIPPED_UNSUPPORTED_TYPE" | "SKIPPED_TOO_LARGE";

export interface EmailSyncResult {
  imported: number;
  duplicates: number;
  skipped: number;
  items: Array<{
    filename: string;
    subject: string | null;
    fromAddress: string | null;
    outcome: EmailImportOutcome;
    documentId: string | null;
    ruleName: string;
  }>;
}

export interface ImportedEmailAttachment {
  id: string;
  attachmentFilename: string;
  subject?: string | null;
  fromAddress?: string | null;
  messageDate?: string | null;
  documentId?: string | null;
  outcome: EmailImportOutcome;
  importedAt: string;
  rule?: { name: string } | null;
}

export interface PlanRefinance {
  id: string;
  planPropertyId: string;
  yearNumber: number;
  targetLvr?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface PlanEquityDraw {
  id: string;
  planPropertyId: string;
  yearNumber: number;
  amount: number;
  interestRate?: number | null;
  /** The property the equity comes from: any property owned. */
  sourceAssetId?: string | null;
  sourceAsset?: { id: string; name: string; disposalDate?: string | null; property?: { id: string } | null; commercialProperty?: { id: string } | null } | null;
  sourceCommercialPropertyId?: string | null;
  sourceCommercialProperty?: CommercialProperty | null;
  /** Once drawn: the real loan it became, and when. */
  liability?: { id: string; name: string } | null;
  drawnDate?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PlanProperty {
  id: string;
  planId: string;
  name: string;
  acquisitionYearNumber: number;
  purchasePrice: number;
  initialLvr: number;
  initialRent?: number | null;
  transferDuty?: number | null;
  otherBuyingCosts?: number | null;
  gstPayable?: boolean;
  commercialPropertyId?: string | null;
  commercialProperty?: CommercialProperty | null;
  /** Bought: the property in the records it became (any kind). */
  assetId?: string | null;
  asset?: PlanSourceAsset | null;
  notes?: string | null;
  createdAt: string;
  refinances?: PlanRefinance[];
  equityDraws?: PlanEquityDraw[];
}

export interface PortfolioPlan {
  id: string;
  name: string;
  entityId?: string | null;
  entity?: Entity | null;
  startFinancialYearId: string;
  startFinancialYear?: FinancialYear;
  projectionYears: number;
  interestRate: number;
  rentalGrowthRate: number;
  capRate: number;
  annualContribution: number;
  refinanceLvrTarget: number;
  depositPercent: number;
  /** Cash on hand at the start, for the cash pool. */
  startingCash: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  properties?: PlanProperty[];
  /** Properties already owned, in the plan. */
  holdings?: Array<{ id: string; assetId: string; asset?: PlanSourceAsset }>;
  /** A what-if version: the plan it was copied from. */
  basePlanId?: string | null;
  basePlan?: { id: string; name: string } | null;
  whatIfs?: Array<{ id: string; name: string }>;
  /** JSON array of person ids whose income backs the borrowing check. */
  borrowerIds?: string | null;
}

export type PlanSourceAsset = {
  id: string;
  name: string;
  disposalDate?: string | null;
  property?: { id: string } | null;
  commercialProperty?: { id: string } | null;
};

export interface PropertyProfitYear {
  id: string;
  assetId: string;
  fyLabel: string;
  rent: number;
  costs: number;
  interest: number;
  depreciation: number;
  taxResult: number;
  cashBeforeTax: number;
  cashAfterTax: number | null;
  value: number | null;
  /** AUTO (saved by the app) | ENTERED (typed in) */
  source: string;
  final: boolean;
  note: string | null;
}

export interface PlanBorrowingCheck {
  people: Array<{ id: string; name: string }>;
  /** True when the plan names who backs it; false = everyone with a salary. */
  chosen: boolean;
  years: Array<{
    yearNumber: number;
    newBorrowing: number;
    parts: string[];
    capacity: [number, number];
    dtiLimit: number;
    status: "FINE" | "SOME_LENDERS" | "TOO_MUCH" | null;
    reason: string | null;
  }>;
  overYears: Array<{ yearNumber: number; status: "SOME_LENDERS" | "TOO_MUCH" }>;
  notes: string[];
}

export type PlanTimelineEvent = { yearNumber: number; type: "BUY" | "REFINANCE" | "DRAW_FROM" | "DRAW_FOR"; label: string };

export interface PlanHoldingProjection {
  holdingId: string;
  assetId: string;
  name: string;
  use: string;
  page: string;
  sold: boolean;
  /** Its loan's interest counts in the plan's cash (an investment, not the home). */
  loanInCash: boolean;
  start: { value: number; loan: number; rent: number; interest: number };
  /** What the records don't have yet. */
  missing: string[];
  events: PlanTimelineEvent[];
  rows: Array<{
    yearNumber: number;
    propertyValue: number;
    loan: number;
    rent: number;
    interest: number;
    cashflow: number;
    equity: number;
    lvr: number | null;
    releasableEquity: number;
    drawn: number;
  }>;
}

export interface PlanActualFigures {
  propertyValue: number | null;
  rent: number | null;
  debt: number | null;
  cashFlow: number | null;
  equity: number | null;
}

export interface PlanProjectionYearRow {
  yearNumber: number;
  trancheStartYear: number;
  propertyValue: number;
  loan: number;
  lvr: number | null;
  rent: number;
  interest: number;
  cashflow: number;
  equity: number;
  accumulatedCashflowSinceTranche: number;
  growthEquitySinceTranche: number;
  releasableEquity: number;
  redeploymentCapacity: number;
  fundingCost: number;
  netCashflowAfterFunding: number;
  actual: PlanActualFigures | null;
}

export interface PlanPropertyProjection {
  planPropertyId: string;
  name: string;
  acquisitionYearNumber: number;
  linked: boolean;
  commercialPropertyName: string | null;
  linkedAsset?: { id: string; name: string } | null;
  events: PlanTimelineEvent[];
  hasFunding: boolean;
  positivelyGearedFromYear: number | null;
  /** Cash needed to buy: deposit plus the costs the loan doesn't cover. */
  purchase: {
    deposit: number;
    transferDuty: number;
    dutyEstimated: boolean;
    dutyRatesYear: string;
    gst: number;
    otherCosts: number;
    cashNeeded: number;
  };
  rows: PlanProjectionYearRow[];
}

export interface PortfolioYearTotals {
  yearNumber: number;
  numberOfProperties: number;
  totalValue: number;
  totalLoan: number;
  totalEquity: number;
  totalCashflow: number;
  totalFundingCost: number;
  totalCashflowAfterFunding: number;
  cumulativeContributions: number;
  totalAvailableForRedeployment: number;
  /** Cash needed for the properties bought this year (deposits and buying costs). */
  cashToBuy: number;
  ownedValue: number;
  ownedLoan: number;
  /** Equity drawn this year, and cash released by refinances this year. */
  equityDrawn: number;
  refinanceCash: number;
  cashPoolStart: number;
  /** Cash left at the end of the year. */
  cashPool: number;
  short: boolean;
}

export interface PortfolioPlanProjection {
  plan: { id: string; name: string; projectionYears: number; startFinancialYearLabel: string; startingCash: number; basePlanId: string | null };
  properties: PlanPropertyProjection[];
  holdings: PlanHoldingProjection[];
  portfolioByYear: PortfolioYearTotals[];
  shortYears: Array<{ yearNumber: number; shortBy: number }>;
  note: string;
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
    revealTfn: (id: string) => request<{ tfn: string | null }>(`/entities/${id}/tfn`),
    create: (data: Partial<Entity>) => request<Entity>("/entities", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Entity>) =>
      request<Entity>(`/entities/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/entities/${id}`, { method: "DELETE" }),
    addRelationship: (data: Partial<EntityRelationship>) =>
      request<EntityRelationship>("/entities/relationships", { method: "POST", body: JSON.stringify(data) }),
    removeRelationship: (id: string) => request<void>(`/entities/relationships/${id}`, { method: "DELETE" }),
    addBeneficiaries: (id: string, personIds: string[]) =>
      request<{ added: number }>(`/entities/${id}/beneficiaries`, { method: "POST", body: JSON.stringify({ personIds }) }),
  },

  people: {
    list: () => request<Person[]>("/people"),
    get: (id: string) => request<Person>(`/people/${id}`),
    revealTfn: (id: string) => request<{ tfn: string | null }>(`/people/${id}/tfn`),
    revealMotherMaidenName: (id: string) => request<{ motherMaidenName: string | null }>(`/people/${id}/mother-maiden-name`),
    create: (data: Partial<Person>) => request<Person>("/people", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Omit<Person, "featuresOff">> & { featuresOff?: string[] }) =>
      request<Person>(`/people/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/people/${id}`, { method: "DELETE" }),
    addRelationship: (data: Partial<PersonEntityRelationship>) =>
      request<PersonEntityRelationship & { familySuggestions: FamilySuggestion[] }>("/people/relationships", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    removeRelationship: (id: string) => request<void>(`/people/relationships/${id}`, { method: "DELETE" }),
    addFamily: (data: { personId: string; relatedPersonId: string; relation: "PARTNER" | "CHILD" | "PARENT" }) =>
      request<unknown>("/people/family", { method: "POST", body: JSON.stringify(data) }),
    removeFamily: (id: string) => request<void>(`/people/family/${id}`, { method: "DELETE" }),
    payPeriods: (personId: string, financialYearId: string) =>
      request<{ payFrequency: string | null; periods: PayPeriod[] }>(
        `/people/${personId}/pay-periods?financialYearId=${financialYearId}`
      ),
    logPayPeriod: (personId: string, data: Record<string, unknown>) =>
      request<PayPeriodEntry>(`/people/${personId}/pay-periods`, { method: "PUT", body: JSON.stringify(data) }),
    removePayPeriodEntry: (entryId: string) => request<void>(`/people/pay-periods/${entryId}`, { method: "DELETE" }),
    setPayPeriodSuper: (entryId: string, superPaid: boolean | null) =>
      request<PayPeriodEntry>(`/people/pay-periods/${entryId}/super`, { method: "PATCH", body: JSON.stringify({ superPaid }) }),
  },

  debtAllocation: {
    loan: (liabilityId: string) => request<LoanAllocation>(`/debt-allocation/loans/${liabilityId}`),
    addPurpose: (liabilityId: string, data: Record<string, unknown>) =>
      request<LoanPurpose>(`/debt-allocation/loans/${liabilityId}/purposes`, { method: "POST", body: JSON.stringify(data) }),
    updatePurpose: (id: string, data: Record<string, unknown>) =>
      request<LoanPurpose>(`/debt-allocation/purposes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removePurpose: (id: string) => request<void>(`/debt-allocation/purposes/${id}`, { method: "DELETE" }),
    saveInterestYear: (liabilityId: string, data: Record<string, unknown>) =>
      request<LoanInterestYear>(`/debt-allocation/loans/${liabilityId}/interest-years`, { method: "PUT", body: JSON.stringify(data) }),
    removeInterestYear: (id: string) => request<void>(`/debt-allocation/interest-years/${id}`, { method: "DELETE" }),
    schedule: (fy: string) => request<{ fy: string; rows: InterestScheduleRow[]; years: string[] }>(`/debt-allocation/schedule?fy=${fy}`),
    usableEquity: (assetId: string) => request<UsableEquity>(`/debt-allocation/usable-equity/${assetId}`),
    previewDraw: (data: Record<string, unknown>) =>
      request<EquityDrawPreview>("/debt-allocation/equity-draw", { method: "POST", body: JSON.stringify({ ...data, confirm: false }) }),
    draw: (data: Record<string, unknown>) =>
      request<{ loanId: string; warnings: string[] }>("/debt-allocation/equity-draw", { method: "POST", body: JSON.stringify({ ...data, confirm: true }) }),
  },
  claimNotes: {
    get: (targetType: ClaimTargetType, targetId: string) =>
      request<ClaimView>(`/claim-notes?${new URLSearchParams({ targetType, targetId })}`),
    save: (data: Record<string, unknown>) => request<ClaimNote>("/claim-notes", { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/claim-notes/${id}`, { method: "DELETE" }),
    exportUrl: (targetType: ClaimTargetType, targetId: string) => `/api/claim-notes/export?${new URLSearchParams({ targetType, targetId })}`,
  },
  borrowing: {
    get: () =>
      request<{
        assumptions: BorrowingAssumptions;
        defaults: BorrowingAssumptions;
        people: Array<{ id: string; name: string; grossSalary: number | null; variableIncome: number | null }>;
        spendingHintMonthly: number | null;
      }>("/borrowing"),
    estimate: (personIds: string[], assumptions: Partial<BorrowingAssumptions>) =>
      request<BorrowingEstimate>("/borrowing/estimate", { method: "POST", body: JSON.stringify({ personIds, assumptions }) }),
    saveAssumptions: (assumptions: Partial<BorrowingAssumptions>) =>
      request<BorrowingAssumptions>("/borrowing/assumptions", { method: "PUT", body: JSON.stringify(assumptions) }),
  },
  payg: {
    get: (personId: string, fy: string) => request<PaygView>(`/payg/people/${personId}?fy=${fy}`),
    addDeduction: (personId: string, data: Record<string, unknown>) =>
      request<WorkDeduction>(`/payg/people/${personId}/deductions`, { method: "POST", body: JSON.stringify(data) }),
    removeDeduction: (id: string) => request<void>(`/payg/deductions/${id}`, { method: "DELETE" }),
    addStatement: (personId: string, data: Record<string, unknown>) =>
      request<IncomeStatement>(`/payg/people/${personId}/income-statements`, { method: "POST", body: JSON.stringify(data) }),
    removeStatement: (id: string) => request<void>(`/payg/income-statements/${id}`, { method: "DELETE" }),
    guides: () => request<OccupationGuideSummary[]>("/payg/guides"),
    checklist: (personId: string, fy: string) => request<OccupationChecklist>(`/payg/people/${personId}/checklist?fy=${fy}`),
    choose: (personId: string, itemKey: string, choice: "CLAIM" | "NOT_FOR_ME" | null) =>
      request<void>(`/payg/people/${personId}/checklist/${encodeURIComponent(itemKey)}`, { method: "PUT", body: JSON.stringify({ choice }) }),
    carCompare: (data: Record<string, unknown>) =>
      request<{ baseIncome: number; incomeRecorded: boolean; options: CarOption[] }>("/payg/car-compare", { method: "POST", body: JSON.stringify(data) }),
  },
  mirror: {
    status: () => request<MirrorStatus>("/mirror"),
    update: (data: { enabled?: boolean; folder?: string | null }) => request<MirrorStatus>("/mirror", { method: "PUT", body: JSON.stringify(data) }),
    sync: () => request<MirrorStatus>("/mirror/sync", { method: "POST" }),
  },
  app: {
    info: () => request<AppInfo>("/app/info"),
    install: async (file: File): Promise<{ version: string; notes: string | null; restarting: boolean }> => {
      const form = new FormData();
      form.append("update", file);
      const res = await fetch(`${BASE}/app/update`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Installing failed: ${res.status}`);
      }
      return res.json();
    },
    rollback: () => request<{ version: string; restarting: boolean }>("/app/rollback", { method: "POST" }),
    updateSeen: () => request<void>("/app/update-seen", { method: "POST" }),
    online: () => request<OnlineUpdate>("/app/online"),
    checkOnline: () => request<OnlineUpdate>("/app/online/check", { method: "POST" }),
    setAutoCheck: (autoCheck: boolean) => request<OnlineUpdate>("/app/online/settings", { method: "PUT", body: JSON.stringify({ autoCheck }) }),
    remindLater: (version: string) => request<OnlineUpdate>("/app/online/later", { method: "POST", body: JSON.stringify({ version }) }),
    installOnline: () => request<OnlineUpdate>("/app/online/install", { method: "POST" }),
  },
  expected: {
    get: (params: { fy?: string; target?: string } = {}) => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as Array<[string, string]>).toString();
      return request<ExpectedResult>(`/expected${q ? `?${q}` : ""}`);
    },
    setAside: (key: string, reason: string) =>
      request<unknown>("/expected/set-aside", { method: "PUT", body: JSON.stringify({ key, reason }) }),
    restore: (key: string) => request<void>(`/expected/set-aside?key=${encodeURIComponent(key)}`, { method: "DELETE" }),
  },
  advice: {
    checklist: () => request<{ items: ChecklistItem[]; referenceDocs: Record<string, string> }>("/accountant-checklist"),
    factsUrl: (id: string) => `/api/accountant-checklist/${encodeURIComponent(id)}/facts`,
    structurePeople: () =>
      request<{ people: Array<{ id: string; name: string; income: number; incomeRecorded: boolean; existingNswLand: number }> }>("/structure-comparison"),
    compareStructures: (data: Record<string, unknown>) =>
      request<{ options: StructureOption[] }>("/structure-comparison", { method: "POST", body: JSON.stringify(data) }),
  },
  referenceLibrary: {
    status: () => request<ReferenceLibraryStatus>("/reference-library"),
    load: () => request<{ added: number; alreadyHere: number; missing: string[] }>("/reference-library/load", { method: "POST" }),
    checks: () => request<ReferenceChecks>("/reference-library/checks"),
    check: () =>
      request<{ checked: number; updated: number; newYear: number; withdrawn: number; broken: number; failed: number; current: number }>(
        "/reference-library/check",
        { method: "POST" }
      ),
    figures: () => request<ReferenceFigures>("/reference-library/figures"),
    downloadStatus: () => request<ReferenceDownloadStatus>("/reference-library/download"),
    startDownload: () => request<ReferenceDownloadStatus>("/reference-library/download", { method: "POST" }),
    downloadZipUrl: `${BASE}/reference-library/download/zip`,
  },
  advisers: {
    list: () => request<Adviser[]>("/advisers"),
    create: (data: Record<string, unknown>) => request<Adviser>("/advisers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Adviser>(`/advisers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/advisers/${id}`, { method: "DELETE" }),
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
    /** Archives: the document is kept but hidden from everyday lists. */
    remove: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
    removePermanently: (id: string) => request<void>(`/documents/${id}?permanent=true`, { method: "DELETE" }),
    addLink: (id: string, data: { targetType: string; targetId: string; label?: string }) =>
      request<DocumentLink>(`/documents/${id}/links`, { method: "POST", body: JSON.stringify(data) }),
    removeLink: (id: string, linkId: string) =>
      request<void>(`/documents/${id}/links/${linkId}`, { method: "DELETE" }),
    /** Its layout with every figure, date, name and address blanked out — to share for teaching the readers. */
    layout: (id: string) => request<{ text: string; filename: string }>(`/documents/${id}/layout`),
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

  acquisitionModel: {
    compute: (inputs: AcquisitionInputs) => request<AcquisitionFigures>("/acquisition-model", { method: "POST", body: JSON.stringify(inputs) }),
  },

  considering: {
    list: () => request<ConsideredProperty[]>("/considering"),
    add: (data: { kind: "RESIDENTIAL" | "COMMERCIAL"; address: string; askingPrice?: number | null; entityId: string; owners?: unknown }) =>
      request<{ assetId: string; id: string; route: string }>("/considering", { method: "POST", body: JSON.stringify(data) }),
    setStage: (assetId: string, stage: string) =>
      request<{ stage: string }>(`/considering/${assetId}/stage`, { method: "PUT", body: JSON.stringify({ stage }) }),
    passOn: (assetId: string, reason: string) =>
      request<{ status: string }>(`/considering/${assetId}/pass`, { method: "POST", body: JSON.stringify({ reason }) }),
    reconsider: (assetId: string) => request<{ status: string }>(`/considering/${assetId}/reconsider`, { method: "POST", body: "{}" }),
    assessment: (assetId: string) => request<Assessment>(`/considering/${assetId}/assessment`),
    saveAssessment: (assetId: string, data: AssessmentInputs) =>
      request<Assessment>(`/considering/${assetId}/assessment`, { method: "PUT", body: JSON.stringify(data) }),
    checks: (assetId: string) => request<DueDiligence>(`/considering/${assetId}/checks`),
    saveCheck: (assetId: string, key: string, data: CheckUpdate) =>
      request<DueDiligence>(`/considering/${assetId}/checks/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(data) }),
    ensureCheck: (assetId: string, key: string) =>
      request<{ id: string }>(`/considering/${assetId}/checks/${encodeURIComponent(key)}/ensure`, { method: "POST", body: "{}" }),
    addCheck: (assetId: string, data: { kind: "CHECK" | "ISSUE" | "DEVELOPMENT"; label: string; group?: string | null; cost?: number | null }) =>
      request<DueDiligence>(`/considering/${assetId}/checks`, { method: "POST", body: JSON.stringify(data) }),
    removeCheck: (assetId: string, key: string) =>
      request<DueDiligence>(`/considering/${assetId}/checks/${encodeURIComponent(key)}`, { method: "DELETE" }),
    bought: (assetId: string, price?: number | null) =>
      request<{ status: string }>(`/considering/${assetId}/bought`, { method: "POST", body: JSON.stringify({ price }) }),
  },

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
    history: (id: string) => request<LoanHistory>(`/liabilities/${id}/readings`),
    addReading: (id: string, data: { asAt: string; interestRate?: number | null; balance?: number | null; note?: string | null }) =>
      request<LoanReading>(`/liabilities/${id}/readings`, { method: "POST", body: JSON.stringify(data) }),
    removeReading: (readingId: string) => request<void>(`/liabilities/readings/${readingId}`, { method: "DELETE" }),
    readStatement: (id: string, documentId: string) =>
      request<StatementProposal>(`/liabilities/${id}/statements/read`, { method: "POST", body: JSON.stringify({ documentId }) }),
    applyStatement: (id: string, data: Record<string, unknown>) =>
      request<{ changed: string[]; olderThanRecorded: boolean; recordedAsAt: string | null }>(`/liabilities/${id}/statements/apply`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    addOwnership: (liabilityId: string, data: Record<string, unknown>) =>
      request<unknown>(`/liabilities/${liabilityId}/ownerships`, { method: "POST", body: JSON.stringify(data) }),
    removeOwnership: (ownershipId: string) => request<void>(`/liabilities/ownerships/${ownershipId}`, { method: "DELETE" }),
  },

  investments: {
    list: (entityId?: string) => request<InvestmentAccount[]>(`/investments${entityId ? `?entityId=${entityId}` : ""}`),
    get: (id: string) => request<InvestmentAccount>(`/investments/${id}`),
    addOwnership: (accountId: string, data: Record<string, unknown>) =>
      request<unknown>(`/investments/${accountId}/ownerships`, { method: "POST", body: JSON.stringify(data) }),
    removeOwnership: (ownershipId: string) => request<void>(`/investments/ownerships/${ownershipId}`, { method: "DELETE" }),
    create: (data: Record<string, unknown>) =>
      request<InvestmentAccount>("/investments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<InvestmentAccount>(`/investments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/investments/${id}`, { method: "DELETE" }),

    listSecurities: (q?: string) =>
      request<Security[]>(`/investments/securities${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    createSecurity: (data: Record<string, unknown>) =>
      request<Security>("/investments/securities", { method: "POST", body: JSON.stringify(data) }),
    updateSecurity: (id: string, data: Record<string, unknown>) =>
      request<Security>(`/investments/securities/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    setPrice: (securityId: string, price: number, priceDate?: string) =>
      request<unknown>(`/investments/securities/${securityId}/prices`, {
        method: "POST",
        body: JSON.stringify({ price, priceDate }),
      }),
    refreshPrices: () => request<PriceRefreshResult>("/investments/prices/refresh", { method: "POST" }),

    addParcel: (accountId: string, data: Record<string, unknown>) =>
      request<InvestmentParcel>(`/investments/${accountId}/parcels`, { method: "POST", body: JSON.stringify(data) }),
    updateParcel: (parcelId: string, data: Record<string, unknown>) =>
      request<InvestmentParcel>(`/investments/parcels/${parcelId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeParcel: (parcelId: string) => request<void>(`/investments/parcels/${parcelId}`, { method: "DELETE" }),

    disposalPreview: (accountId: string, params: Record<string, string | number>) => {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      return request<DisposalPreview>(`/investments/${accountId}/disposal-preview?${qs}`);
    },
    addDisposal: (accountId: string, data: Record<string, unknown>) =>
      request<InvestmentDisposal>(`/investments/${accountId}/disposals`, { method: "POST", body: JSON.stringify(data) }),
    removeDisposal: (disposalId: string) => request<void>(`/investments/disposals/${disposalId}`, { method: "DELETE" }),

    addDividend: (accountId: string, data: Record<string, unknown>) =>
      request<InvestmentDividend>(`/investments/${accountId}/dividends`, { method: "POST", body: JSON.stringify(data) }),
    removeDividend: (dividendId: string) => request<void>(`/investments/dividends/${dividendId}`, { method: "DELETE" }),
  },

  banking: {
    listAccounts: (entityId?: string) => request<Account[]>(`/banking/accounts${entityId ? `?entityId=${entityId}` : ""}`),
    getAccount: (id: string) => request<Account>(`/banking/accounts/${id}`),
    createAccount: (data: Record<string, unknown>) =>
      request<Account>("/banking/accounts", { method: "POST", body: JSON.stringify(data) }),
    updateAccount: (id: string, data: Record<string, unknown>) =>
      request<Account>(`/banking/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removeAccount: (id: string) => request<void>(`/banking/accounts/${id}`, { method: "DELETE" }),
    revealNumber: (id: string) => request<{ accountNumber: string | null }>(`/banking/accounts/${id}/account-number`),
    addOwnership: (accountId: string, data: Record<string, unknown>) =>
      request<unknown>(`/banking/accounts/${accountId}/ownerships`, { method: "POST", body: JSON.stringify(data) }),
    removeOwnership: (ownershipId: string) => request<void>(`/banking/ownerships/${ownershipId}`, { method: "DELETE" }),
    addTransaction: (accountId: string, data: Record<string, unknown>) =>
      request<Transaction>(`/banking/accounts/${accountId}/transactions`, { method: "POST", body: JSON.stringify(data) }),
    updateTransaction: (transactionId: string, data: Record<string, unknown>) =>
      request<Transaction>(`/banking/transactions/${transactionId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeTransaction: (transactionId: string) =>
      request<void>(`/banking/transactions/${transactionId}`, { method: "DELETE" }),
  },

  identity: {
    forPerson: (personId: string) => request<IdentityRecord[]>(`/identity/person/${personId}`),
    create: (data: Record<string, unknown>) =>
      request<IdentityRecord>("/identity", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<IdentityRecord>(`/identity/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    reveal: (id: string) => request<{ number: string | null; referenceNumber: string | null }>(`/identity/${id}/reveal`),
    remove: (id: string) => request<void>(`/identity/${id}`, { method: "DELETE" }),
  },
  insurance: {
    list: (params?: Record<string, string>) =>
      request<InsurancePolicy[]>(`/insurance${params ? `?${new URLSearchParams(params)}` : ""}`),
    get: (id: string) => request<InsurancePolicy>(`/insurance/${id}`),
    create: (data: Record<string, unknown>) =>
      request<InsurancePolicy>("/insurance", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<InsurancePolicy>(`/insurance/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    reveal: (id: string) => request<{ policyNumber: string | null }>(`/insurance/${id}/reveal`),
    remove: (id: string) => request<void>(`/insurance/${id}`, { method: "DELETE" }),
  },
  estate: {
    forPerson: (personId: string) => request<EstateDocument[]>(`/estate/person/${personId}`),
    create: (data: Record<string, unknown>) =>
      request<EstateDocument>("/estate", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<EstateDocument>(`/estate/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/estate/${id}`, { method: "DELETE" }),
  },
  tree: {
    get: () => request<AssetTreeData>("/tree"),
  },
  smsf: {
    get: (fundId: string, fy?: string) => request<SmsfOverview>(`/smsf/${fundId}${fy ? `?fy=${fy}` : ""}`),
    saveDetails: (fundId: string, data: Record<string, unknown>) =>
      request<SmsfDetails>(`/smsf/${fundId}/details`, { method: "PUT", body: JSON.stringify(data) }),
    addMember: (fundId: string, personId: string, trustee: boolean) =>
      request<void>(`/smsf/${fundId}/members`, { method: "POST", body: JSON.stringify({ personId, trustee }) }),
    removeMember: (fundId: string, personId: string) => request<void>(`/smsf/${fundId}/members/${personId}`, { method: "DELETE" }),
    saveMemberYear: (fundId: string, data: Record<string, unknown>) =>
      request<SmsfMemberYear>(`/smsf/${fundId}/member-years`, { method: "PUT", body: JSON.stringify(data) }),
    removeMemberYear: (id: string) => request<void>(`/smsf/member-years/${id}`, { method: "DELETE" }),
    addContribution: (fundId: string, data: Record<string, unknown>) =>
      request<SmsfContribution>(`/smsf/${fundId}/contributions`, { method: "POST", body: JSON.stringify(data) }),
    removeContribution: (id: string) => request<void>(`/smsf/contributions/${id}`, { method: "DELETE" }),
    addPension: (fundId: string, data: Record<string, unknown>) =>
      request<unknown>(`/smsf/${fundId}/pensions`, { method: "POST", body: JSON.stringify(data) }),
    updatePension: (id: string, data: Record<string, unknown>) =>
      request<unknown>(`/smsf/pensions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removePension: (id: string) => request<void>(`/smsf/pensions/${id}`, { method: "DELETE" }),
    savePensionBalance: (id: string, fyLabel: string, openingBalance: number) =>
      request<unknown>(`/smsf/pensions/${id}/balances`, { method: "PUT", body: JSON.stringify({ fyLabel, openingBalance }) }),
    addPensionPayment: (id: string, data: Record<string, unknown>) =>
      request<unknown>(`/smsf/pensions/${id}/payments`, { method: "POST", body: JSON.stringify(data) }),
    removePensionPayment: (id: string) => request<void>(`/smsf/pension-payments/${id}`, { method: "DELETE" }),
  },
  vehicleBusiness: {
    logbooks: (assetId: string) => request<VehicleLogbook[]>(`/vehicle-business/${assetId}/logbooks`),
    addLogbook: (assetId: string, data: Record<string, unknown>) =>
      request<VehicleLogbook>(`/vehicle-business/${assetId}/logbooks`, { method: "POST", body: JSON.stringify(data) }),
    updateLogbook: (id: string, data: Record<string, unknown>) =>
      request<VehicleLogbook>(`/vehicle-business/logbooks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removeLogbook: (id: string) => request<void>(`/vehicle-business/logbooks/${id}`, { method: "DELETE" }),
    schedule: (assetId: string, fy: string) => request<BusinessUseSchedule>(`/vehicle-business/${assetId}/schedule?fy=${fy}`),
    saveYear: (assetId: string, fy: string, data: Record<string, unknown>) =>
      request<BusinessUseSchedule>(`/vehicle-business/${assetId}/years/${fy}`, { method: "PUT", body: JSON.stringify(data) }),
    toWorkDeductions: (assetId: string, fy: string) =>
      request<WorkDeduction>(`/vehicle-business/${assetId}/schedule/${fy}/work-deduction`, { method: "POST" }),
  },
  reminders: {
    list: (params?: Record<string, string>) => request<Reminder[]>(`/reminders${params ? `?${new URLSearchParams(params)}` : ""}`),
    get: (id: string) => request<Reminder>(`/reminders/${id}`),
    create: (data: Record<string, unknown>) => request<Reminder>("/reminders", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) => request<Reminder>(`/reminders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    complete: (id: string, note?: string | null) =>
      request<{ reminder: Reminder; next: Reminder | null }>(`/reminders/${id}/complete`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }),
    reopen: (id: string) => request<Reminder>(`/reminders/${id}/reopen`, { method: "POST" }),
    remove: (id: string) => request<void>(`/reminders/${id}`, { method: "DELETE" }),
  },
  calendar: {
    list: () => request<CalendarEvent[]>("/calendar"),
    tasks: (from: string, to: string) => request<CalendarTask[]>(`/calendar/tasks?from=${from}&to=${to}`),
    complete: (key: string, opts: { note?: string | null; rollForward?: boolean } = {}) =>
      request<{ key: string; done: boolean; movedTo: string | null }>("/calendar/complete", { method: "POST", body: JSON.stringify({ key, ...opts }) }),
    reopen: (key: string) => request<{ key: string; done: boolean }>("/calendar/reopen", { method: "POST", body: JSON.stringify({ key }) }),
    icsUrl: `${BASE}/calendar/expiries.ics`,
  },
  assets: {
    list: (params?: Record<string, string>) => request<Asset[]>(`/assets${params ? `?${new URLSearchParams(params)}` : ""}`),
    get: (id: string) => request<Asset>(`/assets/${id}`),
    valueChecked: (id: string) => request<unknown>(`/assets/${id}/value-checked`, { method: "POST" }),
    sale: (id: string) => request<AssetSale>(`/assets/${id}/sale`),
    create: (data: Record<string, unknown>) => request<Asset>("/assets", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Asset>(`/assets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/assets/${id}`, { method: "DELETE" }),
    addMaintenance: (assetId: string, data: Record<string, unknown>) =>
      request<MaintenanceRecord>(`/assets/${assetId}/maintenance`, { method: "POST", body: JSON.stringify(data) }),
    removeMaintenance: (recordId: string) => request<void>(`/assets/maintenance/${recordId}`, { method: "DELETE" }),
    addOwnership: (assetId: string, data: Record<string, unknown>) =>
      request<AssetOwnership>(`/assets/${assetId}/ownerships`, { method: "POST", body: JSON.stringify(data) }),
    updateOwnership: (ownershipId: string, data: Record<string, unknown>) =>
      request<AssetOwnership>(`/assets/ownerships/${ownershipId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeOwnership: (ownershipId: string) => request<void>(`/assets/ownerships/${ownershipId}`, { method: "DELETE" }),
  },

  graph: () => request<Graph>("/graph"),

  taxRecords: {
    list: (params?: Record<string, string>) =>
      request<TaxRecord[]>(`/tax-records${params ? `?${new URLSearchParams(params)}` : ""}`),
    create: (data: Record<string, unknown>) =>
      request<TaxRecord>("/tax-records", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<TaxRecord>(`/tax-records/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/tax-records/${id}`, { method: "DELETE" }),
  },

  reports: {
    propertyProfit: () => request<{ rows: PropertyProfitRow[]; taxYear: string; interestYear: string | null }>("/reports/property-profit"),
    profitYears: (assetId: string) =>
      request<{ years: PropertyProfitYear[]; interestByYear: Record<string, number> }>(`/reports/property-profit/${assetId}/years`),
    addProfitYear: (assetId: string, data: { fyLabel: string; rent: number; costs: number; interest: number; depreciation?: number; note?: string | null }) =>
      request<PropertyProfitYear>(`/reports/property-profit/${assetId}/years`, { method: "POST", body: JSON.stringify(data) }),
    removeProfitYear: (id: string) => request<void>(`/reports/property-profit/years/${id}`, { method: "DELETE" }),
    propertyPerformance: () =>
      request<{ rows: PropertyPerformanceRow[]; formula: string }>("/reports/property-performance"),
    investmentPortfolio: () =>
      request<{
        rows: InvestmentPortfolioRow[];
        totals: {
          totalCostBase: number;
          totalMarketValue: number;
          totalUnrealisedGain: number | null;
          unpricedCount: number;
          realisedNetGain: number;
          frankingCredits: number;
        };
        note: string;
      }>("/reports/investment-portfolio"),
    capitalGains: (financialYearId: string) =>
      request<CapitalGainsReport>(`/reports/capital-gains?financialYearId=${financialYearId}`),
    taxSummary: (financialYearId?: string) =>
      request<{ rows: TaxSummaryRow[] }>(`/reports/tax-summary${financialYearId ? `?financialYearId=${financialYearId}` : ""}`),
    debtSummary: () => request<DebtSummary>("/reports/debt-summary"),
    incomeSpending: (params: { months: number; entityId?: string }) =>
      request<IncomeSpending>(
        `/reports/income-spending?${new URLSearchParams({ months: String(params.months), ...(params.entityId ? { entityId: params.entityId } : {}) })}`
      ),
  },

  netWorth: {
    preview: (entityId?: string) => request<NetWorthBreakdown>(`/net-worth/preview${entityId ? `?entityId=${entityId}` : ""}`),
    listSnapshots: (entityId?: string) =>
      request<NetWorthSnapshot[]>(`/net-worth/snapshots${entityId ? `?entityId=${entityId}` : ""}`),
    saveSnapshot: (data: Record<string, unknown>) =>
      request<NetWorthSnapshot>("/net-worth/snapshots", { method: "POST", body: JSON.stringify(data) }),
    removeSnapshot: (id: string) => request<void>(`/net-worth/snapshots/${id}`, { method: "DELETE" }),
  },

  commercialProperties: {
    list: (entityId?: string) =>
      request<CommercialProperty[]>(`/commercial-properties${entityId ? `?entityId=${entityId}` : ""}`),
    portfolio: (valuationBasis?: "current" | "purchase") =>
      request<CommercialPortfolio>(`/commercial-properties/portfolio${valuationBasis ? `?valuationBasis=${valuationBasis}` : ""}`),
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
    extractLeaseTerms: (tenancyId: string) =>
      request<LeaseExtractionResponse>(`/commercial-properties/tenancies/${tenancyId}/extract-lease-terms`),

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

  portfolioPlans: {
    list: (entityId?: string) => request<PortfolioPlan[]>(`/portfolio-plans${entityId ? `?entityId=${entityId}` : ""}`),
    get: (id: string) => request<PortfolioPlan>(`/portfolio-plans/${id}`),
    create: (data: Record<string, unknown>) =>
      request<PortfolioPlan>("/portfolio-plans", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<PortfolioPlan>(`/portfolio-plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/portfolio-plans/${id}`, { method: "DELETE" }),
    projection: (id: string) => request<PortfolioPlanProjection>(`/portfolio-plans/${id}/projection`),
    borrowing: (id: string) => request<PlanBorrowingCheck>(`/portfolio-plans/${id}/borrowing`),

    addProperty: (planId: string, data: Record<string, unknown>) =>
      request<PlanProperty>(`/portfolio-plans/${planId}/properties`, { method: "POST", body: JSON.stringify(data) }),
    updateProperty: (propertyId: string, data: Record<string, unknown>) =>
      request<PlanProperty>(`/portfolio-plans/properties/${propertyId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeProperty: (propertyId: string) => request<void>(`/portfolio-plans/properties/${propertyId}`, { method: "DELETE" }),

    addRefinance: (propertyId: string, data: Record<string, unknown>) =>
      request<PlanRefinance>(`/portfolio-plans/properties/${propertyId}/refinances`, { method: "POST", body: JSON.stringify(data) }),
    removeRefinance: (refinanceId: string) => request<void>(`/portfolio-plans/refinances/${refinanceId}`, { method: "DELETE" }),

    addEquityDraw: (propertyId: string, data: Record<string, unknown>) =>
      request<PlanEquityDraw>(`/portfolio-plans/properties/${propertyId}/equity-draws`, { method: "POST", body: JSON.stringify(data) }),
    removeEquityDraw: (drawId: string) => request<void>(`/portfolio-plans/equity-draws/${drawId}`, { method: "DELETE" }),

    addHolding: (planId: string, assetId: string) =>
      request<{ id: string }>(`/portfolio-plans/${planId}/holdings`, { method: "POST", body: JSON.stringify({ assetId }) }),
    removeHolding: (holdingId: string) => request<void>(`/portfolio-plans/holdings/${holdingId}`, { method: "DELETE" }),
    copy: (planId: string, name?: string) =>
      request<PortfolioPlan>(`/portfolio-plans/${planId}/copy`, { method: "POST", body: JSON.stringify(name ? { name } : {}) }),
  },

  transactionImport: {
    inspect: async (file: File): Promise<CsvInspection> => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/transaction-import/inspect`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed: ${res.status}`);
      return res.json();
    },
    preview: async (file: File, accountId: string, mapping: CsvColumnMapping): Promise<CsvPreview> => {
      const form = new FormData();
      form.append("file", file);
      form.append("accountId", accountId);
      form.append("mapping", JSON.stringify(mapping));
      const res = await fetch(`${BASE}/transaction-import/preview`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed: ${res.status}`);
      return res.json();
    },
    commit: async (
      file: File,
      accountId: string,
      mapping: CsvColumnMapping
    ): Promise<{ imported: number; duplicates: number; skipped: number }> => {
      const form = new FormData();
      form.append("file", file);
      form.append("accountId", accountId);
      form.append("mapping", JSON.stringify(mapping));
      const res = await fetch(`${BASE}/transaction-import/commit`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed: ${res.status}`);
      return res.json();
    },
  },

  vault: {
    changePasscode: (currentPasscode: string, newPasscode: string) =>
      request<{ changed: boolean }>("/vault/change-passcode", {
        method: "POST",
        body: JSON.stringify({ currentPasscode, newPasscode }),
      }),
  },

  importBatches: {
    list: () => request<ImportBatchSummary[]>("/import-batches"),
    create: (name: string) =>
      request<ImportBatch>("/import-batches", { method: "POST", body: JSON.stringify({ name }) }),
    uploadFile: async (batchId: string, file: File, relativePath?: string): Promise<ImportBatchFile> => {
      const form = new FormData();
      form.append("file", file);
      if (relativePath) form.append("relativePath", relativePath);
      const res = await fetch(`${BASE}/import-batches/${batchId}/files`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed: ${res.status}`);
      }
      return res.json();
    },
    groups: (batchId: string) => request<ImportBatchReview>(`/import-batches/${batchId}/groups`),
    apply: (batchId: string, data: Record<string, unknown>) =>
      request<{ updated: number }>(`/import-batches/${batchId}/apply`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    complete: (batchId: string) => request<ImportBatch>(`/import-batches/${batchId}/complete`, { method: "POST" }),
    remove: (batchId: string) => request<void>(`/import-batches/${batchId}`, { method: "DELETE" }),
  },

  emailImport: {
    listAccounts: () => request<EmailAccount[]>("/email-import/accounts"),
    connect: (data: { emailAddress: string; appPassword: string }) =>
      request<EmailAccount>("/email-import/accounts", { method: "POST", body: JSON.stringify(data) }),
    updateAccount: (id: string, data: { appPassword?: string; enabled?: boolean }) =>
      request<EmailAccount>(`/email-import/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    testAccount: (id: string) => request<{ ok: boolean }>(`/email-import/accounts/${id}/test`, { method: "POST" }),
    disconnect: (id: string) => request<void>(`/email-import/accounts/${id}`, { method: "DELETE" }),

    addRule: (accountId: string, data: Record<string, unknown>) =>
      request<EmailImportRule>(`/email-import/accounts/${accountId}/rules`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateRule: (ruleId: string, data: Record<string, unknown>) =>
      request<EmailImportRule>(`/email-import/rules/${ruleId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeRule: (ruleId: string) => request<void>(`/email-import/rules/${ruleId}`, { method: "DELETE" }),

    sync: (accountId: string) =>
      request<EmailSyncResult>(`/email-import/accounts/${accountId}/sync`, { method: "POST" }),
    history: (accountId: string) => request<ImportedEmailAttachment[]>(`/email-import/accounts/${accountId}/history`),
  },

  documentPacks: {
    preview: (entityId: string, financialYearId?: string) =>
      request<PackPreview>(
        `/document-packs/preview?entityId=${entityId}${financialYearId ? `&financialYearId=${financialYearId}` : ""}`
      ),
    generate: async (data: { entityId: string; financialYearId?: string; categories: string[]; generated: string[] }): Promise<Blob> => {
      const res = await fetch(`${BASE}/document-packs/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed: ${res.status}`);
      }
      return res.blob();
    },
  },
};
