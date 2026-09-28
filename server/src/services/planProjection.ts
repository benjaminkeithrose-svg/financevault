import { prisma } from "../db.js";
import { NSW_DUTY_RATES_YEAR, nswTransferDuty } from "./nswDuty.js";

// ---------------------------------------------------------------------------
// Portfolio Plan projection — always computed live from the plan's stored
// inputs and the records, never persisted, so changing an assumption (or a
// property's value in the records) is reflected immediately.
//
// Planned purchases: value and rent grow at the plan's rate; the loan is
// interest-only and held flat between refinances, resetting at each
// refinance to (that refinance's target LVR) x (value at that point) — the
// arithmetic behind the portfolio-compounding illustration this is modelled
// on.
//
// Properties already owned ("holdings"): start from today's value, loans and
// rent in the records, and grow the same way. Equity drawn from one adds to
// its loan from that year (the draw's interest is charged to the purchase it
// pays for, as before, so it isn't counted twice).
//
// The cash pool: starting cash, plus the yearly contribution, the year's cash
// from rent less interest (properties that earn rent — the home's loan is a
// living cost, paid from pay, so it's left out), equity drawn and cash
// released by refinances, less the cash each purchase needs. A year it goes
// below zero is flagged.
//
// Refinance and purchase timing is never auto-decided: redeployment capacity
// and the cash pool are shown to help judge when you could act.
// ---------------------------------------------------------------------------

/**
 * Cash needed to buy a planned property: the deposit plus the buying costs
 * the loan doesn't cover. Duty is estimated from the NSW general rates unless
 * a figure is entered. A tenanted commercial property sold as a going
 * concern is GST-free (GSTR 2002/5); otherwise 10% GST is paid at settlement,
 * even if a GST-registered buyer later claims it back.
 */
export function purchaseCosts(p: {
  purchasePrice: number;
  initialLvr: number;
  transferDuty: number | null;
  otherBuyingCosts: number | null;
  gstPayable: boolean;
}) {
  const deposit = Math.max(0, p.purchasePrice * (1 - p.initialLvr));
  const dutyEstimated = p.transferDuty === null || p.transferDuty === undefined;
  const transferDuty = dutyEstimated ? nswTransferDuty(p.purchasePrice) : p.transferDuty!;
  const gst = p.gstPayable ? p.purchasePrice * 0.1 : 0;
  const otherCosts = p.otherBuyingCosts ?? 0;
  return {
    deposit,
    transferDuty,
    dutyEstimated,
    dutyRatesYear: NSW_DUTY_RATES_YEAR,
    gst,
    otherCosts,
    cashNeeded: deposit + transferDuty + gst + otherCosts,
  };
}

function financialYearLabelForOffset(startLabel: string, yearNumber: number): string {
  const startYear = Number(startLabel.split("-")[0]);
  const fyStartYear = startYear + (yearNumber - 1);
  return `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`;
}

/** Residential uses whose own loan is part of the plan's cash (not a living cost). */
const RENTED_USES = new Set(["INVESTMENT", "HOLIDAY_RENTED"]);

export type TimelineEvent = { yearNumber: number; type: "BUY" | "REFINANCE" | "DRAW_FROM" | "DRAW_FOR"; label: string };

export async function projectPlan(planId: string) {
  const plan = await prisma.portfolioPlan.findUnique({
    where: { id: planId },
    include: {
      startFinancialYear: true,
      properties: {
        include: {
          refinances: { orderBy: { yearNumber: "asc" } },
          commercialProperty: true,
          asset: { select: { id: true, name: true } },
          equityDraws: { orderBy: { yearNumber: "asc" }, include: { sourceAsset: { select: { id: true, name: true } } } },
        },
        orderBy: { acquisitionYearNumber: "asc" },
      },
      holdings: {
        include: {
          asset: {
            include: {
              property: true,
              commercialProperty: { include: { tenancies: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!plan) return null;

  const g = plan.rentalGrowthRate;
  const years = Array.from({ length: plan.projectionYears }, (_, i) => i + 1);
  const allDraws = plan.properties.flatMap((p) => p.equityDraws.map((d) => ({ ...d, forName: p.name })));

  // ---- Planned purchases -------------------------------------------------
  const propertyRows = await Promise.all(
    plan.properties.map(async (property) => {
      const initialRent = property.initialRent ?? property.purchasePrice * plan.capRate;
      const valueIn = (y: number) => property.purchasePrice * Math.pow(1 + g, y - property.acquisitionYearNumber);
      const loanIn = (y: number) => {
        const prior = property.refinances.filter((r) => r.yearNumber <= y);
        if (!prior.length) return { loan: property.purchasePrice * property.initialLvr, trancheStartYear: property.acquisitionYearNumber };
        const last = prior[prior.length - 1];
        return { loan: valueIn(last.yearNumber) * (last.targetLvr ?? plan.refinanceLvrTarget), trancheStartYear: last.yearNumber };
      };
      const rows = [];

      for (const yearNumber of years) {
        if (yearNumber < property.acquisitionYearNumber) continue;
        const yearsSincePurchase = yearNumber - property.acquisitionYearNumber;
        const value = valueIn(yearNumber);
        const rent = initialRent * Math.pow(1 + g, yearsSincePurchase);
        const { loan, trancheStartYear } = loanIn(yearNumber);
        const trancheStartValue = valueIn(trancheStartYear);

        // Cash a refinance this year releases: the new loan less the one before.
        const refinancedNow = property.refinances.some((r) => r.yearNumber === yearNumber) && yearNumber > property.acquisitionYearNumber;
        const refinanceCash = refinancedNow ? loan - loanIn(yearNumber - 1).loan : 0;

        const interest = loan * plan.interestRate;
        const cashflow = rent - interest;
        const lvr = value ? loan / value : null;
        const equity = value - loan;
        const growthEquitySinceTranche = value - trancheStartValue;
        const releasableEquity = plan.refinanceLvrTarget * value - loan;

        let accumulatedCashflow = 0;
        for (let y = trancheStartYear; y <= yearNumber; y++) {
          const yRent = initialRent * Math.pow(1 + g, y - property.acquisitionYearNumber);
          accumulatedCashflow += yRent - interest; // loan flat within tranche, so interest is constant across it
        }

        let actual: Record<string, number | null> | null = null;
        if (property.commercialPropertyId) {
          const fyLabel = financialYearLabelForOffset(plan.startFinancialYear.label, yearNumber);
          const fy = await prisma.financialYear.findUnique({ where: { label: fyLabel } });
          if (fy) {
            const snapshot = await prisma.annualPropertySnapshot.findUnique({
              where: { commercialPropertyId_financialYearId: { commercialPropertyId: property.commercialPropertyId, financialYearId: fy.id } },
            });
            if (snapshot) {
              actual = {
                propertyValue: snapshot.propertyValue,
                rent: snapshot.rent,
                debt: snapshot.debt,
                cashFlow: snapshot.cashFlow,
                equity: snapshot.equity,
              };
            }
          }
        }

        const activeDraws = property.equityDraws.filter((d) => d.yearNumber <= yearNumber);
        const fundingCost = activeDraws.reduce((s, d) => s + d.amount * (d.interestRate ?? plan.interestRate), 0);
        const netCashflowAfterFunding = cashflow - fundingCost;

        rows.push({
          yearNumber,
          trancheStartYear,
          propertyValue: value,
          loan,
          lvr,
          rent,
          interest,
          cashflow,
          equity,
          accumulatedCashflowSinceTranche: accumulatedCashflow,
          growthEquitySinceTranche,
          releasableEquity,
          redeploymentCapacity: accumulatedCashflow + releasableEquity,
          fundingCost,
          netCashflowAfterFunding,
          refinanceCash,
          actual,
        });
      }

      const events: TimelineEvent[] = [
        { yearNumber: property.acquisitionYearNumber, type: "BUY", label: `Bought for $${Math.round(property.purchasePrice).toLocaleString("en-AU")}` },
        ...property.refinances.map((r) => ({
          yearNumber: r.yearNumber,
          type: "REFINANCE" as const,
          label: `Refinanced to ${Math.round((r.targetLvr ?? plan.refinanceLvrTarget) * 100)}% of its value`,
        })),
        ...property.equityDraws.map((d) => ({
          yearNumber: d.yearNumber,
          type: "DRAW_FOR" as const,
          label: `$${Math.round(d.amount).toLocaleString("en-AU")} of equity from ${d.sourceAsset?.name ?? "somewhere not decided yet"}`,
        })),
      ];

      return {
        planPropertyId: property.id,
        name: property.name,
        acquisitionYearNumber: property.acquisitionYearNumber,
        linked: Boolean(property.commercialPropertyId || property.assetId),
        commercialPropertyName: property.commercialProperty?.name ?? null,
        linkedAsset: property.asset ?? null,
        hasFunding: property.equityDraws.length > 0,
        positivelyGearedFromYear: rows.find((r) => r.netCashflowAfterFunding >= 0)?.yearNumber ?? null,
        purchase: purchaseCosts(property),
        events: events.filter((e) => e.yearNumber <= plan.projectionYears).sort((a, b) => a.yearNumber - b.yearNumber),
        rows,
      };
    })
  );

  // ---- Properties already owned -----------------------------------------
  const holdingRows = await Promise.all(
    plan.holdings.map(async (h) => {
      const a = h.asset;
      const property = a.property;
      const commercial = a.commercialProperty;
      const loans = await prisma.liability.findMany({
        where: {
          OR: [
            { securityAssetId: a.id },
            ...(property ? [{ securityPropertyId: property.id }] : []),
            ...(commercial ? [{ securityCommercialPropertyId: commercial.id }] : []),
          ],
        },
        select: { currentBalance: true, interestRate: true },
      });
      const loan0 = loans.reduce((s, l) => s + (l.currentBalance ?? 0), 0);
      const interest0 = loans.reduce((s, l) => s + (l.currentBalance ?? 0) * (l.interestRate !== null ? l.interestRate / 100 : plan.interestRate), 0);
      const use = property ? (property.use ?? "INVESTMENT") : "COMMERCIAL";
      const rent0 = commercial
        ? commercial.tenancies.filter((t) => t.leaseStatus === "ACTIVE").reduce((s, t) => s + (t.rentPerAnnum ?? t.currentBaseRent ?? 0), 0)
        : use === "HOME" || use === "HOLIDAY"
          ? 0
          : (property?.weeklyRent ?? 0) * 52;
      // Its loan's interest is part of the plan's cash if it's an investment; the home's is a living cost.
      const loanInCash = commercial ? true : RENTED_USES.has(use);
      const earnsRent = commercial ? true : use !== "HOME" && use !== "HOLIDAY";
      const value0 = a.currentValue ?? 0;

      const missing: string[] = [];
      if (!a.currentValue) missing.push("its current value");
      if (earnsRent && !rent0) missing.push(commercial ? "its leases' rent" : "its weekly rent");
      if (loans.some((l) => (l.currentBalance ?? 0) > 0 && l.interestRate === null)) missing.push("a loan's interest rate (the plan's rate is used)");

      const drawsFrom = allDraws.filter((d) => d.sourceAssetId === a.id);
      const rows = years.map((yearNumber) => {
        const grow = Math.pow(1 + g, yearNumber - 1);
        const value = value0 * grow;
        const rent = rent0 * grow;
        const drawn = drawsFrom.filter((d) => d.yearNumber <= yearNumber).reduce((s, d) => s + d.amount, 0);
        const loan = loan0 + drawn;
        const interest = interest0; // drawn equity's interest is charged to the purchase it pays for
        const cashflow = (earnsRent ? rent : 0) - (loanInCash ? interest : 0);
        return {
          yearNumber,
          propertyValue: value,
          loan,
          rent,
          interest,
          cashflow,
          equity: value - loan,
          lvr: value ? loan / value : null,
          releasableEquity: plan.refinanceLvrTarget * value - loan,
          drawn,
        };
      });

      return {
        holdingId: h.id,
        assetId: a.id,
        name: a.name,
        use,
        page: property ? `/properties/${property.id}` : commercial ? `/commercial-properties/${commercial.id}` : `/assets/${a.id}`,
        sold: !!a.disposalDate,
        loanInCash,
        start: { value: value0, loan: loan0, rent: rent0, interest: interest0 },
        missing,
        events: drawsFrom.map((d) => ({
          yearNumber: d.yearNumber,
          type: "DRAW_FROM" as const,
          label: `$${Math.round(d.amount).toLocaleString("en-AU")} of equity drawn for ${d.forName}`,
        })),
        rows,
      };
    })
  );

  // ---- The whole plan, year by year --------------------------------------
  let cashPool = plan.startingCash;
  const portfolioByYear = years.map((yearNumber) => {
    const planned = propertyRows.flatMap((p) => p.rows.filter((r) => r.yearNumber === yearNumber));
    const owned = holdingRows.map((h) => h.rows[yearNumber - 1]);
    const ownedValue = owned.reduce((s, r) => s + r.propertyValue, 0);
    const ownedLoan = owned.reduce((s, r) => s + r.loan, 0);
    const ownedCashflow = owned.reduce((s, r) => s + r.cashflow, 0);
    const plannedValue = planned.reduce((s, r) => s + r.propertyValue, 0);
    const plannedLoan = planned.reduce((s, r) => s + r.loan, 0);
    const totalValue = plannedValue + ownedValue;
    const totalLoan = plannedLoan + ownedLoan;
    const totalCashflow = planned.reduce((s, r) => s + r.cashflow, 0) + ownedCashflow;
    const totalFundingCost = planned.reduce((s, r) => s + r.fundingCost, 0);
    const totalRedeploymentCapacity = planned.reduce((s, r) => s + r.redeploymentCapacity, 0);
    const cumulativeContributions = plan.annualContribution * yearNumber;
    const cashToBuy = propertyRows.filter((p) => p.acquisitionYearNumber === yearNumber).reduce((s, p) => s + p.purchase.cashNeeded, 0);
    const equityDrawn = allDraws.filter((d) => d.yearNumber === yearNumber).reduce((s, d) => s + d.amount, 0);
    const refinanceCash = planned.reduce((s, r) => s + r.refinanceCash, 0);
    const cashflowAfterFunding = totalCashflow - totalFundingCost;
    const cashPoolStart = cashPool;
    cashPool = cashPoolStart + plan.annualContribution + cashflowAfterFunding + equityDrawn + refinanceCash - cashToBuy;
    return {
      yearNumber,
      numberOfProperties: planned.length + owned.length,
      totalValue,
      totalLoan,
      totalEquity: totalValue - totalLoan,
      ownedValue,
      ownedLoan,
      totalCashflow,
      totalFundingCost,
      totalCashflowAfterFunding: cashflowAfterFunding,
      cumulativeContributions,
      totalAvailableForRedeployment: totalRedeploymentCapacity + cumulativeContributions,
      cashToBuy,
      equityDrawn,
      refinanceCash,
      cashPoolStart,
      cashPool,
      short: cashPool < 0,
    };
  });

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      projectionYears: plan.projectionYears,
      startFinancialYearLabel: plan.startFinancialYear.label,
      startingCash: plan.startingCash,
      basePlanId: plan.basePlanId,
    },
    properties: propertyRows,
    holdings: holdingRows,
    portfolioByYear,
    shortYears: portfolioByYear.filter((y) => y.short).map((y) => ({ yearNumber: y.yearNumber, shortBy: -y.cashPool })),
    note:
      "Projected figures from the assumptions above — not a recommendation. Refinance timing and new purchases are your own decisions; redeployment capacity and the cash pool are shown to help judge when you could act, never auto-applied.",
  };
}
