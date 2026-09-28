import { prisma } from "../db.js";
import { purposeSplit } from "./debtAllocation.js";
import { fyLabelFor } from "./superRules.js";
import { propertyProfit } from "./propertyProfit.js";
import { concessionalStatus, CapHistory, contributionKind } from "./superRules.js";

/**
 * "Worth asking your accountant" (IDEAS.md idea 8): legitimate deductions,
 * offsets and concessions the records suggest might apply but aren't being
 * used, and risks worth raising. Each item says why the app thinks so, the
 * rule and its source, and how settled it is:
 *
 * - SETTLED: clearly allowed — claim it with records.
 * - ARGUABLE: a reasonable position — take the reasoning and sources to the
 *   accountant; a private binding ruling can make it certain.
 * - ATO_TARGETED: an area the ATO has warned about — shown so you know where
 *   the line is.
 *
 * Prompts, not advice. Nothing here looks for schemes: arrangements whose
 * main purpose is a tax benefit can be cancelled under Part IVA.
 */

export type Risk = "SETTLED" | "ARGUABLE" | "ATO_TARGETED";

export interface ChecklistItem {
  id: string;
  title: string;
  why: string;
  rule: string;
  risk: Risk;
  /** A tax reference code (e.g. "TR 2000/2") or a saved source name. */
  source: { label: string; referenceCode?: string };
  action: string;
  link: string | null;
  /** Facts for a private ruling request, for arguable and targeted items. */
  facts?: string[];
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const MONTH = 30.44 * 86_400_000;
const INVESTMENT_LOANS = ["INVESTMENT_LOAN", "COMMERCIAL_LOAN"];

export async function accountantChecklist(today = new Date()): Promise<ChecklistItem[]> {
  const items: ChecklistItem[] = [];
  const fy = fyLabelFor(today);
  const [people, entities, assets, loans, parcels, identities, contributions, memberYears, family, workDeductions] = await Promise.all([
    prisma.person.findMany(),
    prisma.entity.findMany({ select: { id: true, name: true, entityType: true } }),
    prisma.asset.findMany({
      where: { disposalDate: null, parentAssetId: null, assetType: { in: ["PROPERTY", "COMMERCIAL_PROPERTY"] } },
      include: { property: true, commercialProperty: true },
    }),
    prisma.liability.findMany({ include: { purposes: true } }),
    prisma.investmentParcel.findMany({ include: { security: true, allocations: true } }),
    prisma.identityRecord.findMany({ select: { personId: true, kind: true } }),
    prisma.superContribution.findMany(),
    prisma.smsfMemberYear.findMany(),
    prisma.personRelationship.findMany({ where: { relationshipType: "PARTNER" } }),
    prisma.workDeduction.findMany({ where: { fyLabel: fy } }),
  ]);
  const incomeOf = (p: (typeof people)[number]) => (p.grossSalary ?? 0) + (p.variableIncome ?? 0) + (p.carAllowance ?? 0);
  const hasIncome = (p: (typeof people)[number]) => p.grossSalary !== null || p.variableIncome !== null;

  // --- Super -------------------------------------------------------------------
  for (const p of people) {
    const theirs = contributions.filter((c) => c.personId === p.id);
    const years = memberYears.filter((y) => y.personId === p.id);
    if (!theirs.length && !years.length) continue;
    const h: CapHistory = { concessional: {}, nonConcessional: {}, totalSuperBalance: {}, dateOfBirth: p.dateOfBirth, firstYear: fy };
    for (const c of theirs) {
      const y = fyLabelFor(c.date);
      const kind = contributionKind(c.source);
      if (kind === "CONCESSIONAL") h.concessional[y] = (h.concessional[y] ?? 0) + c.amount;
      if (y < h.firstYear) h.firstYear = y;
    }
    for (const y of years) {
      h.totalSuperBalance[y.fyLabel] = Math.max(h.totalSuperBalance[y.fyLabel] ?? 0, y.totalSuperBalance ?? y.closingBalance);
      if (y.fyLabel < h.firstYear) h.firstYear = y.fyLabel;
    }
    const status = concessionalStatus(fy, h);
    if (status.carryForward > 0 && status.remaining > 0) {
      items.push({
        id: `super-carry-forward-${p.id}`,
        title: `${p.name}: ${money(status.remaining)} of concessional super cap unused`,
        why: `Includes ${money(status.carryForward)} carried forward from earlier years, from the contributions recorded here.`,
        rule: "A personal contribution with a notice of intent to claim a deduction counts as concessional and is deductible. Unused cap from the last five years can be used while the total super balance was under $500,000 at the previous 30 June.",
        risk: "SETTLED",
        source: { label: "ATO key super rates and thresholds — carry forward" },
        action: "Ask whether a deductible personal contribution before 30 June suits — it saves tax at the marginal rate less the fund's 15%.",
        link: null,
      });
    }
  }
  for (const p of people) {
    if (!hasIncome(p)) continue;
    const income = incomeOf(p);
    if (income < 64_293 && income > 0) {
      items.push({
        id: `co-contribution-${p.id}`,
        title: `${p.name}: government super co-contribution`,
        why: `Their recorded income (${money(income)}) is under the 2026-27 higher threshold of $64,293.`,
        rule: "The government adds up to $500 to after-tax (non-concessional) super contributions for income under the lower threshold ($49,293 in 2026-27), reducing to nil at the higher threshold.",
        risk: "SETTLED",
        source: { label: "ATO key super rates and thresholds — co-contribution" },
        action: "Consider an after-tax contribution before 30 June.",
        link: `/people/${p.id}`,
      });
    }
    // Medicare levy surcharge without private hospital cover (single threshold).
    if (income > 101_000 && !identities.some((i) => i.personId === p.id && i.kind === "PRIVATE_HEALTH")) {
      const partner = family.some((f) => f.fromPersonId === p.id || f.toPersonId === p.id);
      items.push({
        id: `mls-${p.id}`,
        title: `${p.name}: Medicare levy surcharge`,
        why: `Income ${money(income)} is over the $101,000 single threshold and no private health cover is recorded.${partner ? " With a partner the family threshold ($202,000) applies instead." : ""}`,
        rule: "Without appropriate private hospital cover, 1% to 1.5% extra Medicare levy applies above the threshold.",
        risk: "SETTLED",
        source: { label: "ATO Medicare levy surcharge thresholds" },
        action: "Record the private health cover on their page if they have it; if not, compare the surcharge with the cost of hospital cover.",
        link: `/people/${p.id}`,
      });
    }
  }

  // --- Work deductions ------------------------------------------------------------
  for (const p of people.filter((x) => x.carAllowance && !workDeductions.some((d) => d.personId === x.id && d.category === "CAR"))) {
    items.push({
      id: `car-allowance-${p.id}`,
      title: `${p.name}: car allowance with no car claim`,
      why: `A ${money(p.carAllowance!)} car allowance is recorded, taxed as income, but no car expenses for ${fy}.`,
      rule: "Work kilometres can be claimed at the cents-per-km rate (up to 5,000 km) or by logbook.",
      risk: "SETTLED",
      source: { label: "ATO motor vehicle and car expenses" },
      action: "Keep a diary of work trips and add the car claim on their page.",
      link: `/people/${p.id}`,
    });
  }
  const unevidenced = workDeductions.filter((d) => !d.documentId && !(d.category === "CAR" && d.method === "CENTS_PER_KM"));
  if (unevidenced.length) {
    items.push({
      id: "work-claims-evidence",
      title: `${unevidenced.length} work-related claim${unevidenced.length === 1 ? "" : "s"} without a record`,
      why: "The ATO compares claims with others in the same job — a claim without a record is the first thing lost in a review.",
      rule: "A work-related deduction needs a record proving it.",
      risk: "SETTLED",
      source: { label: "ATO work-related deductions" },
      action: "Attach the receipt or record to each claim.",
      link: null,
    });
  }

  // --- Property ------------------------------------------------------------------
  for (const a of assets) {
    // Rental deductions only matter for a property that's rented (all or part of the time).
    const use = a.property ? (a.property.use ?? (a.mainResidence === "FULL" ? "HOME" : "INVESTMENT")) : "COMMERCIAL";
    if (use === "HOME" || use === "HOLIDAY") continue;
    const link = a.property ? `/properties/${a.property.id}` : a.commercialProperty ? `/commercial-properties/${a.commercialProperty.id}` : null;
    if (use === "HOLIDAY_RENTED") {
      const mainly = a.property!.mainlyRented;
      items.push({
        id: `holiday-home-${a.id}`,
        title: mainly === false ? `${a.name}: holiday home not mainly rented` : `${a.name}: holiday home also rented out`,
        why:
          mainly === false
            ? "It's recorded as not mainly used to earn rent."
            : mainly === true
              ? "It's recorded as mainly rented. The ATO looks at whether you keep peak times (school holidays, Christmas, Easter) for yourselves."
              : "It's a holiday home you also rent out, and whether it's mainly rented isn't recorded.",
        rule:
          "A holiday home you also rent out can only claim its ownership costs — interest, rates, land tax, insurance, repairs — if it's mainly used (or held for use) to earn rent. That's judged on how it's actually used, especially at peak times, not on days alone. Costs of renting it (booking and cleaning fees, management) can always be claimed, and every claim is split for the days you use it. Costs that can't be claimed may be added to its cost base.",
        risk: "ATO_TARGETED",
        source: { label: "TR 2026/1 and PCG 2026/3 (holiday homes)", referenceCode: "TR 2026/1" },
        action:
          mainly === false
            ? "Claim only the costs of renting it, split for your own use, and keep the others for the cost base."
            : "Keep a record of the days booked, the days you and family stayed, and when it was blocked out — and show the accountant.",
        link,
        facts: ["When it's blocked out for your own use each year", "How it's advertised and managed", "Days rented, and occupancy in peak periods"],
      });
    }
    if ((use === "HOLIDAY_RENTED" || use === "HOME_PART_RENTED") && a.property!.rentedShare === null) {
      items.push({
        id: `rented-share-${a.id}`,
        title: `${a.name}: what share is rented?`,
        why: "It's partly rented and partly private, and the rented share isn't recorded.",
        rule: "When a property is partly rented and partly private, its costs are split on a fair and reasonable basis — by the days it's rented, the floor area rented, or both. The ATO sets out the methods it accepts.",
        risk: "SETTLED",
        source: { label: "PCG 2026/2 (apportioning rental property deductions)", referenceCode: "PCG 2026/2" },
        action: "Work out the share with the accountant and enter it under How it's used.",
        link,
      });
    }
    if (use === "HOME_PART_RENTED") {
      items.push({
        id: `part-rented-home-${a.id}`,
        title: `${a.name}: part of your home rented`,
        why: "A room or granny flat in your home is rented out.",
        rule: "Rent from part of your home is income, and the costs of that part can be claimed. But the main residence exemption is reduced for the rented part when the home is sold — and if it was first rented after 20 August 1996, the gain may be worked out from its market value when renting started.",
        risk: "SETTLED",
        source: { label: "ATO guide to capital gains tax — renting out part of your home" },
        action: "Note the date renting started, and get a valuation then if the accountant suggests one.",
        link,
      });
    }
    if (a.depreciationPerYear === null && a.capitalWorksPerYear === null) {
      items.push({
        id: `depreciation-${a.id}`,
        title: `${a.name}: no depreciation schedule recorded`,
        why: "No yearly depreciation or building write-off is entered for this investment property.",
        rule: "Residential buildings whose construction started after 15 September 1987 can usually be written off at 2.5% a year (capital works). Fittings bought new can be depreciated.",
        risk: "SETTLED",
        source: { label: "ATO rental expenses — capital works and depreciating assets" },
        action: "Get a quantity surveyor's depreciation schedule (its fee is deductible) and enter the yearly figures on the property.",
        link,
      });
    }
    const held = today.getTime() - (a.acquisitionDate?.getTime() ?? 0);
    if (a.acquisitionDate && held > 10 * MONTH && held < 12 * MONTH) {
      const eligible = new Date(a.acquisitionDate);
      eligible.setFullYear(eligible.getFullYear() + 1);
      eligible.setDate(eligible.getDate() + 1);
      items.push({
        id: `twelve-months-${a.id}`,
        title: `${a.name}: under 12 months owned`,
        why: `Bought ${a.acquisitionDate.toISOString().slice(0, 10)}.`,
        rule: "A gain on something owned for at least 12 months (not counting the day bought or sold) gets the 50% discount for people and trusts. For CGT the sale date is the contract date, not settlement.",
        risk: "SETTLED",
        source: { label: "ATO guide to capital gains tax" },
        action: `If selling, signing the contract on or after ${eligible.toISOString().slice(0, 10)} halves the taxable gain.`,
        link: null,
      });
    }
  }

  // --- Selling property ------------------------------------------------------------
  // From 1 January 2025, a buyer withholds 15% of the price unless the seller
  // gives them an ATO clearance certificate — for every property, the home too.
  // Sold this financial year or last (last year's return may not be done yet).
  const lastYearStart = new Date(`${Number(fy.slice(0, 4)) - 1}-07-01T00:00:00Z`);
  const sold = await prisma.asset.findMany({
    where: { assetType: { in: ["PROPERTY", "COMMERCIAL_PROPERTY"] }, disposalDate: { gte: lastYearStart } },
    include: { property: { select: { id: true } }, commercialProperty: { select: { id: true } } },
  });
  for (const a of sold) {
    items.push({
      id: `clearance-${a.id}`,
      title: `${a.name}: was 15% withheld from the sale?`,
      why: `Sold ${a.disposalDate!.toISOString().slice(0, 10)}.`,
      rule: "Since 1 January 2025 a buyer must hold back 15% of the price of any property — your home included — unless the seller gave them an ATO clearance certificate before settlement. An Australian resident who didn't gets it back through their tax return.",
      risk: "SETTLED",
      source: { label: "ATO rental properties guide 2026 — foreign resident capital gains withholding" },
      action: "Check the settlement statement. If an amount was withheld, give it to the accountant to claim back.",
      link: a.property ? `/properties/${a.property.id}` : a.commercialProperty ? `/commercial-properties/${a.commercialProperty.id}` : null,
    });
  }

  // --- Business equipment --------------------------------------------------------------
  // The $20,000 instant asset write-off, extended to 2025-26 for small businesses.
  if (fy <= "2026-27") {
    const bought = await prisma.asset.findMany({
      where: {
        disposalDate: null,
        assetType: { in: ["VEHICLE", "EQUIPMENT", "OTHER"] },
        acquisitionDate: { gte: new Date("2025-07-01T00:00:00Z"), lt: new Date("2026-07-01T00:00:00Z") },
        acquisitionCost: { gt: 0, lt: 20_000 },
        entity: { entityType: { in: ["COMPANY", "TRUST", "UNIT_TRUST", "PARTNERSHIP"] } },
      },
      include: { entity: { select: { name: true } } },
    });
    for (const a of bought) {
      items.push({
        id: `instant-write-off-${a.id}`,
        title: `${a.name}: instant asset write-off?`,
        why: `Bought by ${a.entity.name} in 2025-26 for ${money(a.acquisitionCost!)}.`,
        rule: "A small business (turnover under $10 million) can deduct the business-use share of an asset costing less than $20,000 straight away, if it was first used or installed ready for use between 1 July 2025 and 30 June 2026. The limit is per asset.",
        risk: "SETTLED",
        source: { label: "ATO guide to depreciating assets 2026 — $20,000 instant asset write-off" },
        action: "Ask whether the business can write it off in the 2025-26 return.",
        link: `/assets/${a.id}`,
      });
    }
  }

  // --- Loans ------------------------------------------------------------------------
  for (const l of loans) {
    if (INVESTMENT_LOANS.includes(l.liabilityType) && l.purposes.length === 0) {
      items.push({
        id: `loan-uses-${l.id}`,
        title: `${l.name}: what was the money used for?`,
        why: "An investment loan with no uses recorded.",
        rule: "Interest is deductible by what the borrowed money was used for, not what secures the loan.",
        risk: "SETTLED",
        source: { label: "TR 2000/2", referenceCode: "TR 2000/2" },
        action: "Record the loan's uses with the settlement or loan statement.",
        link: `/liabilities/${l.id}`,
      });
    }
    const split = purposeSplit(l.purposes);
    if (split.deductibleShare !== null && split.deductibleShare > 0 && split.deductibleShare < 1) {
      items.push({
        id: `mixed-loan-${l.id}`,
        title: `${l.name}: mixed-purpose loan`,
        why: `${Math.round(split.deductibleShare * 100)}% investment, ${Math.round((1 - split.deductibleShare) * 100)}% private.`,
        rule: "Interest on a mixed loan is apportioned, and every repayment reduces both parts in proportion — extra repayments can't be pointed at the private part. Separate splits keep them apart.",
        risk: "SETTLED",
        source: { label: "TR 2000/2 paragraphs 15-21", referenceCode: "TR 2000/2" },
        action: "Ask whether splitting the loan into investment and private splits suits.",
        link: `/liabilities/${l.id}`,
      });
    }
    const costs = (l.loanFees ?? 0) + (l.establishmentFees ?? 0) + (l.valuationFees ?? 0);
    if (INVESTMENT_LOANS.includes(l.liabilityType) && costs > 100) {
      items.push({
        id: `borrowing-costs-${l.id}`,
        title: `${l.name}: borrowing costs of ${money(costs)}`,
        why: "Establishment, valuation or other loan fees are recorded on an investment loan.",
        rule: "Borrowing expenses over $100 are claimed over 5 years (or the loan's term if shorter).",
        risk: "SETTLED",
        source: { label: "ATO rental expenses — borrowing expenses" },
        action: "Make sure they're being claimed each year.",
        link: `/liabilities/${l.id}`,
      });
    }
  }
  // Split loans where the investment split is interest-only and the private one is being paid down.
  const byFacility = new Map<string, typeof loans>();
  for (const l of loans) if (l.facility) byFacility.set(l.facility, [...(byFacility.get(l.facility) ?? []), l]);
  for (const [facility, splits] of byFacility) {
    const investIO = splits.find((l) => l.interestOnly && purposeSplit(l.purposes).deductibleShare === 1);
    const privatePI = splits.find((l) => !l.interestOnly && purposeSplit(l.purposes).deductibleShare === 0);
    if (investIO && privatePI) {
      items.push({
        id: `split-loan-${facility}`,
        title: `${facility}: investment split interest-only, private split paid down`,
        why: `${investIO.name} is interest-only for investment; ${privatePI.name} is private and being repaid.`,
        rule: "Paying down private debt first is fine. But if the investment split's interest is being added to the loan (capitalised) while the private split is paid, the ATO treats the extra interest as not deductible and may apply Part IVA.",
        risk: "ATO_TARGETED",
        source: { label: "TD 2012/1 (split loans)", referenceCode: "TD 2012/1" },
        action: "Check with the accountant that the investment split's interest is being paid, not capitalised.",
        link: `/liabilities/${investIO.id}`,
        facts: [
          `Facility: ${facility}`,
          `Investment split: ${investIO.name}, interest-only, balance ${money(investIO.currentBalance ?? 0)}`,
          `Private split: ${privatePI.name}, principal and interest, balance ${money(privatePI.currentBalance ?? 0)}`,
        ],
      });
    }
  }
  const month = today.getMonth();
  if (month >= 3 && month <= 5 && loans.some((l) => INVESTMENT_LOANS.includes(l.liabilityType))) {
    items.push({
      id: "prepay-interest",
      title: "Prepaying investment loan interest before 30 June",
      why: "There are investment loans, and it's the last quarter of the financial year.",
      rule: "An individual can deduct up to 12 months of interest paid in advance this year, if the lender offers a fixed-rate prepayment.",
      risk: "SETTLED",
      source: { label: "ATO rental expenses — interest" },
      action: "Ask whether prepaying suits your cash flow and next year's income.",
      link: null,
    });
  }

  // --- Shares ------------------------------------------------------------------------
  for (const parcel of parcels) {
    const remaining = parcel.quantity - parcel.allocations.reduce((s, a) => s + a.quantity, 0);
    const held = today.getTime() - parcel.acquisitionDate.getTime();
    if (remaining > 0 && held > 10 * MONTH && held < 12 * MONTH) {
      const eligible = new Date(parcel.acquisitionDate);
      eligible.setFullYear(eligible.getFullYear() + 1);
      eligible.setDate(eligible.getDate() + 1);
      items.push({
        id: `parcel-${parcel.id}`,
        title: `${parcel.security.code ?? parcel.security.name}: parcel under 12 months`,
        why: `${remaining} bought ${parcel.acquisitionDate.toISOString().slice(0, 10)}.`,
        rule: "Selling after 12 months gets the 50% CGT discount on a gain.",
        risk: "SETTLED",
        source: { label: "ATO personal investors guide to CGT" },
        action: `If selling at a gain, waiting until ${eligible.toISOString().slice(0, 10)} halves the taxable gain.`,
        link: null,
      });
    }
  }

  // --- Trusts and structures ----------------------------------------------------------
  const trusts = entities.filter((e) => e.entityType === "TRUST");
  if (trusts.length) {
    items.push({
      id: "trust-distributions",
      title: "Trust distributions: resolve by 30 June",
      why: `${trusts.map((t) => t.name).join(", ")} ${trusts.length === 1 ? "is a" : "are"} family trust${trusts.length === 1 ? "" : "s"}.`,
      rule: "A discretionary trust's trustee must decide who gets the income by 30 June, or the trustee may be taxed at the top rate. The ATO watches distributions to someone who doesn't really benefit (section 100A) — PCG 2022/2 sets out its low-risk arrangements. TR 2022/4 is under review after the High Court's Bendel decision (June 2026).",
      risk: "ATO_TARGETED",
      source: { label: "TR 2022/4 and PCG 2022/2", referenceCode: "PCG 2022/2" },
      action: "Plan the resolution with the accountant before 30 June; make sure whoever receives a distribution actually benefits from it.",
      link: null,
      facts: trusts.map((t) => `Trust: ${t.name}`),
    });
  }
  const typeOf = new Map(entities.map((e) => [e.id, e.entityType]));
  const profit = await propertyProfit().catch(() => ({ rows: [] }));
  for (const r of profit.rows) {
    const trustOwner = r.owners.find((o) => ["TRUST", "UNIT_TRUST"].includes(typeOf.get(o.entityId) ?? ""));
    if (trustOwner && r.taxResult < 0) {
      items.push({
        id: `trust-loss-${r.assetId}`,
        title: `${r.name}: a loss trapped in ${trustOwner.entityName}`,
        why: `The property's tax result is about ${money(r.taxResult)} a year, owned by a trust.`,
        rule: "A trust's losses can't be distributed — they stay in the trust to offset its future income, rather than reducing anyone's tax on their salary now. NSW land tax also gives family and unit trusts no threshold.",
        risk: "ARGUABLE",
        source: { label: "Revenue NSW — how trusts are assessed; ATO trust losses" },
        action: "Worth reviewing the structure with the accountant — moving a property usually costs stamp duty and CGT, so the numbers need modelling first.",
        link: "/structure-comparison",
        facts: [`Property: ${r.name}`, `Owner: ${trustOwner.entityName}`, `Estimated yearly tax result: ${money(r.taxResult)}`],
      });
    }
  }
  return items;
}
