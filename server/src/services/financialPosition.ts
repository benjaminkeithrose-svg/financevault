// Shared balance-sheet calculation for an Entity (spec sections 8, 9, 10, 20).
// A "byAssetType" breakdown plus totals — used both for a single entity's
// detail page and for the multi-entity consolidated dashboard view.

export interface AssetLike {
  assetType: string;
  currentValue: number | null;
}
export interface AccountLike {
  currentBalance: number | null;
}
export interface LiabilityLike {
  currentBalance: number | null;
}

export function computeFinancialPosition(assets: AssetLike[], accounts: AccountLike[], liabilities: LiabilityLike[]) {
  const byAssetType: Record<string, number> = {};
  for (const a of assets) {
    byAssetType[a.assetType] = (byAssetType[a.assetType] || 0) + (a.currentValue ?? 0);
  }
  const cash = accounts.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);
  const assetValue = assets.reduce((sum, a) => sum + (a.currentValue ?? 0), 0);
  const totalAssets = assetValue + cash;
  const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.currentBalance ?? 0), 0);
  return {
    byAssetType,
    cash,
    totalAssets,
    totalLiabilities,
    netAssets: totalAssets - totalLiabilities,
    formula: "totalAssets = sum(asset current values) + cash in accounts; netAssets = totalAssets - totalLiabilities",
  };
}
