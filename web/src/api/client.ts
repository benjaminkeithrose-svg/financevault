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
  ownershipInfo?: string | null;
  contactInfo?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number; assets: number; liabilities: number };
  relationshipsFrom?: EntityRelationship[];
  relationshipsTo?: EntityRelationship[];
  documents?: Document[];
  assets?: unknown[];
  liabilities?: unknown[];
  accounts?: unknown[];
  properties?: unknown[];
  investmentAccounts?: unknown[];
  taxRecords?: unknown[];
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
}

export interface Settings {
  id: number;
  allowExternalAiProcessing: boolean;
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
};
