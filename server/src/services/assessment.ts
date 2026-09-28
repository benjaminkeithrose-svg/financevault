import { PropertyAssessment } from "@prisma/client";
import { prismaAll } from "../db.js";
import { acquisitionFigures } from "./acquisitionMath.js";
import { residentialEstimate } from "./borrowing.js";
import { borrowingInputs, savedAssumptions } from "./borrowingInputs.js";
import { NSW_DUTY_RATES_YEAR, nswTransferDuty } from "./nswDuty.js";
import { judgeBorrowing, planBorrowers } from "./planBorrowing.js";
import { loadOwnersTax, propertyProfit } from "./propertyProfit.js";

/**
 * The quick assessment of a property you're considering: is it worth a
 * closer look, or a call to the broker? Three columns — expected (the
 * property's own rent and running costs), conservative and bad case (each
 * with their own rent, vacancy, costs and rate) — worked out with the same
 * sums as the Acquisition Model (acquisitionMath), the tax as the Property
 * Profit report does it, and "Can we borrow it?" as the borrowing page does.
 * Only what's entered is used: a figure shows once what it needs is there.
 */

export type ColumnKey = "expected" | "conservative" | "bad";

export interface ColumnFigures {
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
}

export interface AssessmentColumn {
  key: ColumnKey;
  label: string;
  inputs: { rent: number | null; vacancyWeeks: number; costs: number | null; ratePercent: number | null };
  figures: ColumnFigures;
  missing: string[];
  shown: boolean;
}

const LABELS: Record<ColumnKey, string> = { expected: "Expected", conservative: "Conservative", bad: "Bad case" };

/** Costs of open issues found in due diligence (added in cash needed). */
export async function openIssueCosts(assetId: string): Promise<number> {
  void assetId;
  return 0;
}

export async function workingAssessment(assetId: string): Promise<PropertyAssessment | null> {
  return prismaAll.propertyAssessment.findFirst({ where: { assetId, frozenAt: null } });
}

export async function assess(assetId: string) {
  const asset = await prismaAll.asset.findUnique({
    where: { id: assetId },
    include: { ownerships: true, property: true, commercialProperty: true, entity: { select: { entityType: true } } },
  });
  if (!asset || (!asset.property && !asset.commercialProperty)) return null;
  const a = (await workingAssessment(assetId)) ?? null;
  const residential = !!asset.property;
  const state = (asset.property?.state ?? asset.commercialProperty?.state ?? "").toUpperCase();

  const row = (await propertyProfit({ assetIds: [assetId] })).rows[0];
  const landTax = row && row.landTax.basis !== "IN_OUTGOINGS" ? (row.landTax.amount ?? 0) : 0;
  const expectedRent = row && row.rent > 0 ? row.rent : null;
  const expectedCosts = row && (row.runningCosts > 0 || landTax > 0) ? row.runningCosts + landTax : null;

  // The purchase.
  const price = a?.price ?? asset.askingPrice ?? null;
  const purchaseMissing: string[] = [];
  if (!price) purchaseMissing.push("the price (or asking price)");
  let stampDuty: number | null = a?.stampDuty ?? null;
  let dutyEstimated = false;
  if (stampDuty === null && price) {
    if (state === "NSW") {
      stampDuty = nswTransferDuty(price);
      dutyEstimated = true;
    } else {
      purchaseMissing.push("the stamp duty (the estimate is for NSW only)");
    }
  }
  const otherCosts = a?.otherCosts ?? 0;
  const issues = await openIssueCosts(assetId);
  const lvr = a?.lvrPercent ?? null;
  if (lvr === null) purchaseMissing.push("how much you'd borrow (% of the price)");
  const ready = !!price && lvr !== null && stampDuty !== null;
  const loan = price && lvr !== null ? price * (lvr / 100) : null;
  const deposit = price && loan !== null ? price - loan : null;
  const cashNeeded = ready ? deposit! + stampDuty! + otherCosts + issues : null;

  const ownersTax = await loadOwnersTax();
  const term = a?.loanTermYears ?? 30;
  const repaymentType = (a?.repaymentType === "PI" ? "PI" : "IO") as "IO" | "PI";

  const column = (key: ColumnKey, rent: number | null, vacancyWeeks: number, costs: number | null, ratePercent: number | null): AssessmentColumn => {
    const missing = [...purchaseMissing];
    if (rent === null) missing.push(key === "expected" ? (residential ? "the expected rent (on the property)" : "the leases") : "the rent");
    if (costs === null) missing.push(key === "expected" ? "the running costs (Running costs, or Outgoings)" : "the running costs");
    if (loan && ratePercent === null) missing.push("the interest rate");
    const f: ColumnFigures = {
      grossYield: null,
      netYield: null,
      netIncome: null,
      interest: null,
      repayments: null,
      cashBeforeTax: null,
      taxResult: null,
      taxEffect: null,
      cashAfterTax: null,
      weeklyCash: null,
      returnOnCash: null,
      dscr: null,
    };
    if (price && rent !== null) f.grossYield = (rent * (1 - vacancyWeeks / 52)) / price;
    if (price && rent !== null && costs !== null) {
      const m = acquisitionFigures({
        purchasePrice: price,
        acquisitionCosts: (stampDuty ?? 0) + otherCosts + issues,
        lvr: lvr ?? 0,
        rent,
        occupancy: Math.max(0, 1 - vacancyWeeks / 52),
        fixedIncome: 0,
        expenses: costs,
        interestRate: ratePercent ?? 0,
        repaymentType,
        loanTermYears: term,
      });
      f.netIncome = m.noi;
      f.netYield = m.netYield;
      if (lvr !== null && (ratePercent !== null || !loan)) {
        f.interest = m.interestExpense;
        f.repayments = m.annualDebtService;
        f.cashBeforeTax = m.cashFlowAfterFinancing;
        f.dscr = m.dscr;
        // Tax: on the rent less deductible costs, interest and the depreciation schedule.
        f.taxResult = m.noi - m.interestExpense - (asset.depreciationPerYear ?? 0) - (asset.capitalWorksPerYear ?? 0);
        const owners = ownersTax(asset, f.taxResult);
        if (owners.every((o) => o.taxEffect !== null)) {
          f.taxEffect = owners.reduce((s, o) => s + (o.taxEffect ?? 0), 0);
          f.cashAfterTax = f.cashBeforeTax - f.taxEffect;
        }
        const yearly = f.cashAfterTax ?? f.cashBeforeTax;
        f.weeklyCash = yearly / 52;
        if (cashNeeded) f.returnOnCash = yearly / cashNeeded;
      }
    }
    const shown = key === "expected" || rent !== null || costs !== null || ratePercent !== null;
    return { key, label: LABELS[key], inputs: { rent, vacancyWeeks, costs, ratePercent }, figures: f, missing: [...new Set(missing)], shown };
  };

  const columns = [
    column("expected", expectedRent, a?.expectedVacancyWeeks ?? 0, expectedCosts, a?.expectedRatePercent ?? null),
    column("conservative", a?.conservativeRent ?? null, a?.conservativeVacancyWeeks ?? 0, a?.conservativeCosts ?? null, a?.conservativeRatePercent ?? null),
    column("bad", a?.badRent ?? null, a?.badVacancyWeeks ?? 0, a?.badCosts ?? null, a?.badRatePercent ?? null),
  ];

  // Can we borrow it? — whose income backs it, and the new loan on top of the loans already there.
  let borrowing: null | { people: string[]; capacity: [number, number]; status: string | null; reason: string | null; notes: string[] } = null;
  if (loan && loan > 0) {
    const personalOwners = await prismaAll.person.findMany({
      where: { entityId: { in: [asset.entityId, ...asset.ownerships.map((o) => o.ownerEntityId)] } },
      select: { id: true },
    });
    const notes: string[] = [];
    let ids = personalOwners.map((p) => p.id);
    if (ids.length === 0) {
      ids = await planBorrowers(null);
      notes.push("Bought by a trust, company or fund: counted on the income of everyone with a salary recorded (lenders usually want guarantors).");
    }
    const { people, incomes, debts } = await borrowingInputs(ids);
    const saved = await savedAssumptions();
    const rate = a?.expectedRatePercent ?? saved.newLoanRate;
    // The rent it would bring in is counted, shared between the borrowers.
    const share = incomes.length && expectedRent ? (expectedRent * (1 - (a?.expectedVacancyWeeks ?? 0) / 52)) / incomes.length : 0;
    const est = residentialEstimate(
      incomes.map((i) => ({ ...i, rent: i.rent + share })),
      debts,
      { ...saved, newLoanRate: rate }
    );
    const judged = judgeBorrowing(loan, est);
    for (const n of est.notes) if (/No living expenses|No income/.test(n)) notes.push(n);
    if (!residential) notes.push("A commercial loan is also judged on the property's own rent cover (the DSCR above).");
    borrowing = { people: people.map((p) => p.name), ...judged, notes };
  }

  return {
    assetId,
    kind: residential ? "RESIDENTIAL" : "COMMERCIAL",
    inputs: a,
    price,
    priceIsAsking: a?.price == null && !!asset.askingPrice,
    purchase: {
      deposit,
      stampDuty,
      dutyEstimated,
      dutyRatesYear: dutyEstimated ? NSW_DUTY_RATES_YEAR : null,
      otherCosts,
      openIssueCosts: issues,
      cashNeeded,
      loan,
      lvr,
      repaymentType,
      loanTermYears: term,
    },
    expectedFrom: {
      rent: expectedRent,
      costs: expectedCosts,
      costBreakdown: row ? [...row.costBreakdown, ...(landTax ? [{ label: "Land tax", amount: landTax }] : [])] : [],
    },
    columns,
    borrowing,
    advertisedYield: a?.advertisedYieldPercent != null ? a.advertisedYieldPercent / 100 : null,
    supportedYield: residential ? null : columns[0].figures.netYield,
    notes: [
      ...(row?.notes ?? []),
      // Why the tax can't be worked out (a trust's income is taxed in its beneficiaries' hands, an income not entered…).
      ...new Set(
        ownersTax(asset, columns[0].figures.taxResult ?? -1)
          .filter((o) => o.taxEffect === null && o.note)
          .map((o) => `After tax: ${o.note}`)
      ),
    ],
  };
}

export type Assessment = NonNullable<Awaited<ReturnType<typeof assess>>>;
