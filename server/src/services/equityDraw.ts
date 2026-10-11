import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "./audit.js";
import { isMixed, purposeSplit, usableEquity } from "./debtAllocation.js";

/**
 * Drawing equity from a property (IDEAS.md idea 2, stage 2): borrowing more
 * against it, either as a new split under the same facility or as a redraw
 * or increase on a loan already there. Before anything is saved, a preview
 * says what will happen and what to watch for:
 *
 * - more than the usable-equity estimate;
 * - a redraw that makes a single-purpose loan mixed (TR 2000/2 paragraphs
 *   23-25: every repayment from then on is split in proportion);
 * - money used privately, whatever secures it, isn't deductible;
 * - an interest-only investment split alongside a private split being paid
 *   down (TD 2012/1, Hart's case: if the investment interest is capitalised
 *   so more goes to the private loan, the extra interest isn't deductible).
 */

export interface DrawInput {
  assetId: string;
  amount: number;
  date: Date;
  use: string;
  deductible: boolean;
  purposeAssetId?: string | null;
  description: string;
  mode: "NEW_SPLIT" | "EXISTING_LOAN";
  loanId?: string | null;
  name?: string | null;
  planEquityDrawId?: string | null;
}

async function securedLoans(asset: { id: string; property: { id: string } | null; commercialProperty: { id: string } | null }) {
  return prisma.liability.findMany({
    where: {
      OR: [
        { securityAssetId: asset.id },
        ...(asset.property ? [{ securityPropertyId: asset.property.id }] : []),
        ...(asset.commercialProperty ? [{ securityCommercialPropertyId: asset.commercialProperty.id }] : []),
      ],
    },
    include: { purposes: true, ownerships: true },
    orderBy: { createdAt: "asc" },
  });
}

type LoanWithPurposes = Awaited<ReturnType<typeof securedLoans>>[number];

const HART =
  "An interest-only investment split sits alongside a private split that's being paid down. If the investment split's interest is being added to its balance so more of your money goes to the private loan, the ATO treats that as a scheme (TD 2012/1, after Hart's case) and the extra interest isn't deductible. Worth checking with your accountant.";

/** Split-loan arrangements worth a word with the accountant, among loans that share a facility or a property. */
export function splitLoanFlags(loans: Array<{ interestOnly: boolean | null; purposes: Parameters<typeof purposeSplit>[0] }>): string[] {
  const shares = loans.map((l) => ({ l, share: purposeSplit(l.purposes).deductibleShare }));
  const investmentIO = shares.some((x) => x.share !== null && x.share >= 0.99 && x.l.interestOnly === true);
  const privatePaid = shares.some((x) => x.share !== null && x.share <= 0.01 && x.l.interestOnly !== true);
  return investmentIO && privatePaid ? [HART] : [];
}

/** What's worth knowing about one loan: mixed purpose, and its facility's split-loan arrangement. */
export async function loanFlags(loanId: string): Promise<string[]> {
  const loan = await prisma.liability.findUnique({ where: { id: loanId }, include: { purposes: true } });
  if (!loan) return [];
  const flags: string[] = [];
  const split = purposeSplit(loan.purposes);
  if (isMixed(split)) {
    flags.push(
      `Mixed purpose: ${Math.round(split.deductibleShare! * 100)}% of what's owed is deductible. Each repayment comes off both parts in proportion, so the share only changes when more is borrowed. Separate splits for separate purposes are simpler to keep track of.`
    );
  }
  const where = [
    ...(loan.facility ? [{ facility: loan.facility }] : []),
    ...(loan.securityPropertyId ? [{ securityPropertyId: loan.securityPropertyId }] : []),
    ...(loan.securityCommercialPropertyId ? [{ securityCommercialPropertyId: loan.securityCommercialPropertyId }] : []),
  ];
  if (where.length) {
    const siblings = await prisma.liability.findMany({ where: { OR: where }, include: { purposes: true } });
    if (siblings.length > 1) flags.push(...splitLoanFlags(siblings));
  }
  return flags;
}

async function load(input: DrawInput) {
  const asset = await prisma.asset.findUnique({
    where: { id: input.assetId },
    include: { property: { select: { id: true } }, commercialProperty: { select: { id: true } } },
  });
  if (!asset || (!asset.property && !asset.commercialProperty)) throw new HttpError(404, "Property not found");
  const loans = await securedLoans(asset);
  const existing = input.mode === "EXISTING_LOAN" ? loans.find((l) => l.id === input.loanId) : undefined;
  if (input.mode === "EXISTING_LOAN" && !existing) throw new HttpError(400, "Choose the loan to redraw or increase — one secured by this property.");
  const base = existing ?? (input.loanId ? loans.find((l) => l.id === input.loanId) : undefined) ?? loans[0];
  return { asset, loans, existing, base };
}

function newPurpose(input: DrawInput, balanceBefore: number | null) {
  return {
    id: "new",
    date: input.date,
    amount: input.amount,
    deductible: input.deductible,
    assetId: input.purposeAssetId ?? null,
    description: input.description,
    balanceBefore,
  };
}

/** What drawing would do, and what to watch for. Nothing is saved. */
export async function previewDraw(input: DrawInput) {
  const { asset, loans, existing, base } = await load(input);
  const owing = loans.reduce((s, l) => s + (l.currentBalance ?? 0), 0);
  const equity = usableEquity(asset.currentValue, asset.lenderMaxLvr, owing);
  const warnings: string[] = [];
  if (equity && input.amount > equity.usable) {
    warnings.push(
      `That's more than the usable-equity estimate of $${Math.round(equity.usable).toLocaleString("en-AU")} — the lender may want a new valuation, or lend less.`
    );
  }
  if (!input.deductible) {
    warnings.push("Used privately, so its interest isn't deductible — even though the property securing it earns income.");
  }

  let after: LoanWithPurposes[] = loans;
  let resultShare: number | null = null;
  if (existing) {
    const before = purposeSplit(existing.purposes);
    const purposes = [...existing.purposes, newPurpose(input, existing.currentBalance ?? null)];
    const split = purposeSplit(purposes);
    resultShare = split.deductibleShare;
    if (!isMixed(before) && isMixed(split) && before.deductibleShare !== null) {
      warnings.push(
        `This would make "${existing.name}" a mixed-purpose loan: about ${Math.round((split.deductibleShare ?? 0) * 100)}% deductible from then on, with every repayment split in proportion (TR 2000/2). A new split for this money keeps the purposes apart.`
      );
    }
    if (before.deductibleShare === null) {
      warnings.push(`"${existing.name}" has no uses recorded yet, so its existing balance isn't counted either way. Record what it was first borrowed for on the loan's page.`);
    }
    after = loans.map((l) => (l.id === existing.id ? { ...l, purposes } : l)) as LoanWithPurposes[];
  } else {
    resultShare = input.deductible ? 1 : 0;
    after = [
      ...loans,
      // A new split starts with no interest-only setting, as it's created below.
      { interestOnly: null, purposes: [newPurpose(input, null)] } as unknown as LoanWithPurposes,
    ];
  }
  warnings.push(...splitLoanFlags(after));

  const facility = base?.facility ?? base?.name ?? null;
  return {
    mode: input.mode,
    loanName: existing ? existing.name : input.name?.trim() || `${facility ?? asset.name} — ${input.description}`.slice(0, 120),
    facility,
    resultShare,
    usableEquity: equity?.usable ?? null,
    securedLoans: loans.map((l) => ({ id: l.id, name: l.name, currentBalance: l.currentBalance, facility: l.facility })),
    warnings,
  };
}

/** Draws it: a new split, or a redraw on the loan chosen. Returns the loan and the use recorded. */
export async function makeDraw(input: DrawInput) {
  const preview = await previewDraw(input);
  const { asset, existing, base } = await load(input);
  let loanId: string;
  if (existing) {
    const purpose = await prisma.loanPurpose.create({
      data: {
        liabilityId: existing.id,
        date: input.date,
        amount: input.amount,
        use: input.use,
        deductible: input.deductible,
        assetId: input.purposeAssetId ?? null,
        description: input.description,
        balanceBefore: existing.currentBalance ?? null,
        notes: "Redraw or increase, recorded with Draw equity.",
      },
    });
    await prisma.liability.update({ where: { id: existing.id }, data: { currentBalance: (existing.currentBalance ?? 0) + input.amount } });
    loanId = existing.id;
    await logAudit("EQUITY_DRAWN", { targetType: "Liability", targetId: loanId, data: { amount: input.amount, mode: input.mode, purposeId: purpose.id } });
  } else {
    // A new split under the same facility (named after the first loan if it had none).
    if (base && !base.facility) await prisma.liability.update({ where: { id: base.id }, data: { facility: preview.facility } });
    const commercial = !!asset.commercialProperty;
    const loan = await prisma.liability.create({
      data: {
        name: preview.loanName,
        liabilityType: input.deductible ? (commercial ? "COMMERCIAL_LOAN" : "INVESTMENT_LOAN") : "HOME_LOAN",
        entityId: base?.entityId ?? asset.entityId,
        lender: base?.lender ?? null,
        interestRate: base?.interestRate ?? null,
        facility: preview.facility,
        originalAmount: input.amount,
        currentBalance: input.amount,
        startDate: input.date,
        securityPropertyId: asset.property?.id ?? null,
        securityCommercialPropertyId: asset.commercialProperty?.id ?? null,
        notes: "Equity drawn from the property, recorded with Draw equity.",
        ...(base?.ownerships.length
          ? { ownerships: { create: base.ownerships.map((o) => ({ ownerEntityId: o.ownerEntityId, ownershipPercent: o.ownershipPercent })) } }
          : {}),
        purposes: {
          create: [
            {
              date: input.date,
              amount: input.amount,
              use: input.use,
              deductible: input.deductible,
              assetId: input.purposeAssetId ?? null,
              description: input.description,
            },
          ],
        },
      },
    });
    loanId = loan.id;
    await logAudit("EQUITY_DRAWN", { targetType: "Liability", targetId: loanId, data: { amount: input.amount, mode: input.mode } });
  }
  if (input.planEquityDrawId) {
    await prisma.planEquityDraw.update({ where: { id: input.planEquityDrawId }, data: { liabilityId: loanId, drawnDate: input.date } });
  }
  return { loanId, warnings: preview.warnings };
}
