import { prisma } from "../db.js";
import { computeIncomeAndNoi } from "./commercialMetrics.js";
import { interestSchedule } from "./debtAllocation.js";
import { flatRateFor, LATEST_RATES_YEAR, taxChange } from "./incomeTax.js";
import { landTaxByAsset, LandTaxResult } from "./landTax.js";
import { shareOf } from "./ownership.js";

/**
 * After-tax profit per property (IDEAS.md idea 4): what a property really
 * returns once running costs, land tax, interest and tax are counted — so a
 * "4% yield" that's really 2% after costs shows up before tax time.
 *
 * rent − running costs − land tax = net income (net yield)
 * − interest = cash before tax
 * − depreciation and building write-off (not cash) = the tax result
 * each owner's tax on their share of that result → cash after tax
 *
 * Interest is the deductible interest from the debt allocation where the
 * loans' uses are recorded against this property (the latest year with
 * interest entered), otherwise estimated from loans secured on it. An
 * estimate from recorded figures, not tax advice.
 */

const PREMIUM_PER_YEAR: Record<string, number> = { MONTHLY: 12, QUARTERLY: 4, ANNUALLY: 1 };

export interface OwnerTax {
  entityId: string;
  entityName: string;
  share: number;
  taxResult: number;
  /** Positive = extra tax; negative = tax saved. Null when it can't be worked out. */
  taxEffect: number | null;
  note: string | null;
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
  landTax: LandTaxResult | { amount: number; basis: "IN_OUTGOINGS"; notes: string[] };
  netIncome: number;
  interest: number;
  interestBasis: "DEBT_ALLOCATION" | "ESTIMATE" | "NONE";
  interestYear: string | null;
  cashBeforeTax: number;
  depreciation: number;
  capitalWorks: number;
  taxResult: number;
  owners: OwnerTax[];
  cashAfterTax: number | null;
  grossYield: number | null;
  netYield: number | null;
  afterTaxYield: number | null;
  notes: string[];
}

export async function propertyProfit(): Promise<{ rows: PropertyProfitRow[]; taxYear: string; interestYear: string | null }> {
  const [properties, commercial, entities, people, policies] = await Promise.all([
    prisma.property.findMany({
      where: { asset: { disposalDate: null } },
      include: { asset: { include: { ownerships: true } }, liabilities: true },
    }),
    prisma.commercialProperty.findMany({
      where: { asset: { disposalDate: null } },
      include: { asset: { include: { ownerships: true } }, tenancies: true, loans: true },
    }),
    prisma.entity.findMany({ select: { id: true, name: true, entityType: true } }),
    prisma.person.findMany({ select: { entityId: true, name: true, grossSalary: true, variableIncome: true } }),
    prisma.insurancePolicy.findMany({ where: { assetId: { not: null } }, select: { assetId: true, premium: true, premiumFrequency: true, kind: true } }),
  ]);
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const personByEntity = new Map(people.filter((p) => p.entityId).map((p) => [p.entityId!, p]));
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const outgoings = await prisma.outgoingRecord.findMany({ where: { date: { gte: yearAgo } } });

  // Interest by property from the debt allocation, for the latest year with interest entered.
  const latest = await prisma.loanInterestYear.findFirst({ orderBy: { fyLabel: "desc" }, select: { fyLabel: true } });
  const interestYear = latest?.fyLabel ?? null;
  const allocatedInterest = new Map<string, number>();
  if (interestYear) {
    for (const row of await interestSchedule(interestYear)) {
      for (const u of row.byUse) if (u.assetId) allocatedInterest.set(u.assetId, (allocatedInterest.get(u.assetId) ?? 0) + u.interest);
    }
  }
  const assetsWithUses = new Set(
    (await prisma.loanPurpose.findMany({ where: { assetId: { not: null } }, select: { assetId: true } })).map((p) => p.assetId!)
  );

  const landTax = landTaxByAsset(
    [
      ...properties.map((p) => ({ ...p.asset, state: p.state, address: p.address })),
      ...commercial.map((c) => ({ ...c.asset, state: c.state, address: c.address })),
    ],
    new Map(entities.map((e) => [e.id, e.entityType]))
  );

  const insuranceFor = (assetId: string) =>
    policies
      .filter((p) => p.assetId === assetId && p.premium)
      .reduce((s, p) => s + p.premium! * (PREMIUM_PER_YEAR[p.premiumFrequency ?? "ANNUALLY"] ?? 1), 0);

  const interestFor = (assetId: string, securedLoans: Array<{ currentBalance: number | null; interestRate: number | null }>) => {
    if (assetsWithUses.has(assetId) && interestYear) {
      return { interest: allocatedInterest.get(assetId) ?? 0, basis: "DEBT_ALLOCATION" as const };
    }
    const estimate = securedLoans.reduce((s, l) => s + (l.currentBalance ?? 0) * ((l.interestRate ?? 0) / 100), 0);
    return { interest: estimate, basis: estimate ? ("ESTIMATE" as const) : ("NONE" as const) };
  };

  const ownersTax = (
    record: { entityId: string; ownerships: Array<{ ownerEntityId: string; ownershipPercent: number; startDate?: Date | null; endDate?: Date | null }> },
    taxResult: number
  ): OwnerTax[] => {
    const ids = [...new Set([record.entityId, ...record.ownerships.map((o) => o.ownerEntityId)])];
    return ids
      .map((id) => ({ id, share: shareOf(record, id) }))
      .filter((o) => o.share > 0)
      .map(({ id, share }) => {
        const entity = entityById.get(id);
        const mine = taxResult * share;
        const base = { entityId: id, entityName: entity?.name ?? "Unknown", share, taxResult: mine };
        if (entity?.entityType === "INDIVIDUAL") {
          const person = personByEntity.get(id);
          const income = person ? (person.grossSalary ?? 0) + (person.variableIncome ?? 0) : null;
          if (!person || (person.grossSalary === null && person.variableIncome === null)) {
            return { ...base, taxEffect: null, note: `Enter ${person?.name ?? entity.name}'s income on their page to see the tax effect.` };
          }
          return { ...base, taxEffect: taxChange(income!, mine, LATEST_RATES_YEAR), note: mine < 0 ? "A loss reduces their tax on other income (negative gearing)." : null };
        }
        const flat = flatRateFor(entity?.entityType ?? "OTHER");
        if (flat.rate === null) return { ...base, taxEffect: null, note: flat.note };
        if (mine < 0) return { ...base, taxEffect: 0, note: `${flat.note} A loss is carried forward, not refunded.` };
        return { ...base, taxEffect: mine * flat.rate, note: flat.note };
      });
  };

  const finish = (
    base: Omit<PropertyProfitRow, "netIncome" | "cashBeforeTax" | "taxResult" | "owners" | "cashAfterTax" | "grossYield" | "netYield" | "afterTaxYield">,
    record: Parameters<typeof ownersTax>[0]
  ): PropertyProfitRow => {
    const netIncome = base.rent - base.runningCosts - (base.landTax.amount ?? 0);
    const cashBeforeTax = netIncome - base.interest;
    const taxResult = cashBeforeTax - base.depreciation - base.capitalWorks;
    const owners = ownersTax(record, taxResult);
    const allKnown = owners.every((o) => o.taxEffect !== null);
    const cashAfterTax = allKnown ? cashBeforeTax - owners.reduce((s, o) => s + (o.taxEffect ?? 0), 0) : null;
    const v = base.value;
    return {
      ...base,
      netIncome,
      cashBeforeTax,
      taxResult,
      owners,
      cashAfterTax,
      grossYield: v ? base.rent / v : null,
      netYield: v ? netIncome / v : null,
      afterTaxYield: v && cashAfterTax !== null ? cashAfterTax / v : null,
    };
  };

  const rows: PropertyProfitRow[] = [];
  for (const p of properties) {
    if (p.asset.mainResidence === "FULL") continue; // the home isn't an investment
    const rent = (p.weeklyRent ?? 0) * 52;
    const insurance = insuranceFor(p.assetId);
    const management = rent * ((p.managementPercent ?? 0) / 100);
    const costBreakdown = [
      { label: "Council rates", amount: p.councilRates ?? 0 },
      { label: "Water", amount: p.waterRates ?? 0 },
      { label: "Strata", amount: p.strataFees ?? 0 },
      { label: "Insurance", amount: insurance },
      { label: "Property management", amount: management },
      { label: "Repairs", amount: p.repairsPerYear ?? 0 },
      { label: "Other", amount: p.otherCostsPerYear ?? 0 },
    ].filter((c) => c.amount > 0);
    const notes: string[] = [];
    if (!p.weeklyRent) notes.push("No weekly rent recorded on the property.");
    if (costBreakdown.length === 0) notes.push("No running costs recorded — enter them under Running costs on the property page.");
    const { interest, basis } = interestFor(p.assetId, p.liabilities);
    rows.push(
      finish(
        {
          assetId: p.assetId,
          kind: "PROPERTY",
          recordId: p.id,
          name: p.asset.name,
          value: p.asset.currentValue,
          rent,
          runningCosts: costBreakdown.reduce((s, c) => s + c.amount, 0),
          costBreakdown,
          landTax: landTax.get(p.assetId)!,
          interest,
          interestBasis: basis,
          interestYear: basis === "DEBT_ALLOCATION" ? interestYear : null,
          depreciation: p.asset.depreciationPerYear ?? 0,
          capitalWorks: p.asset.capitalWorksPerYear ?? 0,
          notes,
        },
        p.asset
      )
    );
  }
  for (const c of commercial) {
    const mine = outgoings.filter((o) => o.commercialPropertyId === c.id);
    const income = computeIncomeAndNoi(c.tenancies, mine);
    const landTaxInOutgoings = mine.some((o) => o.category === "LAND_TAX");
    const notes = ["Running costs are the last 12 months' outgoings, less what tenants recovered."];
    const { interest, basis } = interestFor(c.assetId, c.loans);
    rows.push(
      finish(
        {
          assetId: c.assetId,
          kind: "COMMERCIAL_PROPERTY",
          recordId: c.id,
          name: c.name,
          value: c.asset.currentValue,
          rent: income.grossRent + income.otherIncome,
          runningCosts: income.unrecoveredExpenses,
          costBreakdown: [{ label: "Outgoings not recovered from tenants", amount: income.unrecoveredExpenses }],
          landTax: landTaxInOutgoings
            ? { amount: 0, basis: "IN_OUTGOINGS", notes: ["Land tax is in the recorded outgoings."] }
            : landTax.get(c.assetId)!,
          interest,
          interestBasis: basis,
          interestYear: basis === "DEBT_ALLOCATION" ? interestYear : null,
          depreciation: c.asset.depreciationPerYear ?? 0,
          capitalWorks: c.asset.capitalWorksPerYear ?? 0,
          notes,
        },
        c.asset
      )
    );
  }
  rows.sort((a, b) => (b.afterTaxYield ?? b.netYield ?? -Infinity) - (a.afterTaxYield ?? a.netYield ?? -Infinity));
  return { rows, taxYear: LATEST_RATES_YEAR, interestYear };
}
