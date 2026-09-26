import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { monthlyRepayment } from "../services/debts.js";
import { fundDates, nextReturnYear } from "../services/smsf.js";
import {
  ageOn,
  CapHistory,
  concessionalStatus,
  contributionKind,
  CONTRIBUTION_SOURCES,
  fyLabelFor,
  fyRange,
  nonConcessionalStatus,
  pensionYear,
  rulesFor,
  shiftFy,
  largeBalanceFlag,
  lrbaPropertyWarning,
} from "../services/superRules.js";

/**
 * A self-managed super fund's own page: members and their contributions
 * against the caps, trustee and compliance details, property bought with a
 * limited recourse borrowing arrangement, and pensions with their minimum
 * drawdowns. The fund itself is an Entity of type SMSF.
 */
export const smsfRouter = Router();

const MAX_MEMBERS = 6;
const fyLabel = z.string().regex(/^\d{4}-\d{2}$/);
const isoDate = z.string().datetime();

async function requireFund(id: string) {
  const fund = await prisma.entity.findUnique({ where: { id } });
  if (!fund) throw new HttpError(404, "Fund not found");
  if (fund.entityType !== "SMSF") throw new HttpError(400, `${fund.name} isn't a self-managed super fund.`);
  return fund;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Annual rent from the property an LRBA loan paid for. */
function annualRent(loan: {
  securityProperty: { weeklyRent: number | null } | null;
  securityCommercialProperty: { tenancies: Array<{ leaseStatus: string; rentPerAnnum: number | null }> } | null;
}): number | null {
  if (loan.securityProperty) return loan.securityProperty.weeklyRent ? loan.securityProperty.weeklyRent * 52 : null;
  if (loan.securityCommercialProperty) {
    const active = loan.securityCommercialProperty.tenancies.filter((t) => t.leaseStatus === "ACTIVE" && t.rentPerAnnum);
    return active.length ? sum(active.map((t) => t.rentPerAnnum!)) : null;
  }
  return null;
}

smsfRouter.get(
  "/:fundId",
  asyncHandler(async (req, res) => {
    await requireFund(req.params.fundId);
    const today = new Date();
    const year = fyLabel.safeParse(req.query.fy).success ? String(req.query.fy) : fyLabelFor(today);
    const { start, end } = fyRange(year);

    const fund = await prisma.entity.findUniqueOrThrow({
      where: { id: req.params.fundId },
      include: {
        smsfDetails: { include: { corporateTrustee: { include: { personRelationships: true } } } },
        personRelationships: { include: { person: true } },
        smsfMemberYears: true,
        smsfPensions: { include: { person: true, balances: true, payments: { orderBy: { date: "asc" } } }, orderBy: { startDate: "asc" } },
        accounts: true,
        liabilities: {
          where: { liabilityType: "LRBA_LOAN" },
          include: {
            holdingTrust: { select: { id: true, name: true } },
            securityProperty: { include: { asset: true } },
            securityCommercialProperty: { include: { asset: true, tenancies: true } },
          },
        },
      },
    });

    // Members: anyone with the MEMBER role, plus anyone with history in the fund.
    const memberIds = new Set(fund.personRelationships.filter((r) => r.relationshipType === "MEMBER").map((r) => r.personId));
    for (const y of fund.smsfMemberYears) memberIds.add(y.personId);
    for (const p of fund.smsfPensions) memberIds.add(p.personId);
    const people = await prisma.person.findMany({ where: { id: { in: [...memberIds] } }, orderBy: { name: "asc" } });
    // Caps are per person across all their funds, so every contribution and
    // balance they have counts, not just this fund's.
    const [contributions, allYears] = await Promise.all([
      prisma.superContribution.findMany({
        where: { personId: { in: [...memberIds] } },
        include: { fund: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.smsfMemberYear.findMany({ where: { personId: { in: [...memberIds] } } }),
    ]);

    const roles = (personId: string, type: string) =>
      fund.personRelationships.some((r) => r.personId === personId && r.relationshipType === type);
    const details = fund.smsfDetails;
    const company = details?.trusteeType === "CORPORATE" ? details.corporateTrustee : null;

    const members = people.map((person) => {
      const theirs = contributions.filter((c) => c.personId === person.id);
      const years = allYears.filter((y) => y.personId === person.id);
      const history: CapHistory = { concessional: {}, nonConcessional: {}, totalSuperBalance: {}, dateOfBirth: person.dateOfBirth, firstYear: year };
      for (const c of theirs) {
        const fy = fyLabelFor(c.date);
        const kind = contributionKind(c.source);
        if (kind === "CONCESSIONAL") history.concessional[fy] = (history.concessional[fy] ?? 0) + c.amount;
        if (kind === "NON_CONCESSIONAL") history.nonConcessional[fy] = (history.nonConcessional[fy] ?? 0) + c.amount;
        if (fy < history.firstYear) history.firstYear = fy;
      }
      for (const label of new Set(years.map((y) => y.fyLabel))) {
        const rows = years.filter((y) => y.fyLabel === label);
        const stated = rows.map((r) => r.totalSuperBalance).filter((v): v is number => v !== null);
        history.totalSuperBalance[label] = stated.length ? Math.max(...stated) : sum(rows.map((r) => r.closingBalance));
        if (label < history.firstYear) history.firstYear = label;
      }
      const ownYears = years.filter((y) => y.fundId === fund.id).sort((a, b) => a.fyLabel.localeCompare(b.fyLabel));
      const pensionStarts = fund.smsfPensions.filter((p) => p.personId === person.id && p.kind === "ACCOUNT_BASED");
      const firstStart = pensionStarts[0]?.startDate;
      // The latest total super balance recorded up to the year shown.
      const tsbYears = Object.keys(history.totalSuperBalance).filter((l) => l <= year).sort();
      const latestTsb = tsbYears.length ? history.totalSuperBalance[tsbYears[tsbYears.length - 1]] : null;
      return {
        personId: person.id,
        name: person.name,
        dateOfBirth: person.dateOfBirth,
        age: person.dateOfBirth ? ageOn(person.dateOfBirth, today) : null,
        isMember: roles(person.id, "MEMBER"),
        isTrustee: roles(person.id, "TRUSTEE"),
        isDirector: !!company?.personRelationships.some((r) => r.personId === person.id && r.relationshipType === "DIRECTOR"),
        years: ownYears,
        latestBalance: ownYears.length ? ownYears[ownYears.length - 1] : null,
        contributions: theirs
          .filter((c) => c.date >= start && c.date <= end)
          .map((c) => ({ ...c, kind: contributionKind(c.source), otherFund: c.paidIntoOtherFund ?? (c.fundId !== fund.id ? c.fund.name : null) })),
        concessional: concessionalStatus(year, history),
        nonConcessional: nonConcessionalStatus(year, history),
        transferBalance: firstStart
          ? {
              used: sum(pensionStarts.map((p) => p.startBalance)),
              cap: rulesFor(fyLabelFor(firstStart)).transferBalanceCap,
              capYear: fyLabelFor(firstStart),
            }
          : null,
        largeBalance: largeBalanceFlag(latestTsb, year),
      };
    });

    const pensions = fund.smsfPensions.map((p) => {
      const opening = p.balances.find((b) => b.fyLabel === year)?.openingBalance ?? null;
      const py = pensionYear(p, year, opening, p.person.dateOfBirth);
      const paid = sum(p.payments.filter((x) => x.date >= start && x.date <= end).map((x) => x.amount));
      return {
        ...p,
        personName: p.person.name,
        year: py,
        openingBalance: opening,
        paidThisYear: paid,
        stillToPay: py.minimum !== null ? Math.max(0, py.minimum - paid) : null,
        overMaximum: py.maximum !== null && paid > py.maximum,
        paymentsThisYear: p.payments.filter((x) => x.date >= start && x.date <= end),
      };
    });

    // Share of fund income that's tax-free because it supports retirement
    // pensions — estimated from balances; the actuary's certificate decides.
    const priorBalances = fund.smsfMemberYears.filter((y) => y.fyLabel === shiftFy(year, -1));
    const fundTotal = sum(priorBalances.map((y) => y.closingBalance));
    const pensionTotal = sum(pensions.filter((p) => p.year.active && p.year.retirementPhase && p.year.basis !== null).map((p) => p.year.basis!));
    const pensionShare = {
      pensionBalances: pensionTotal,
      fundBalance: priorBalances.length ? fundTotal : null,
      share: priorBalances.length && fundTotal > 0 ? Math.min(1, pensionTotal / fundTotal) : null,
    };

    const lrba = fund.liabilities.map((l) => {
      const asset = l.securityProperty?.asset ?? l.securityCommercialProperty?.asset ?? null;
      const rent = annualRent(l);
      const propertyWarning = lrbaPropertyWarning(l.startDate, !!l.securityProperty);
      const monthly = monthlyRepayment(l);
      const repayments = monthly !== null ? monthly * 12 : null;
      return {
        id: l.id,
        name: l.name,
        lender: l.lender,
        balance: l.currentBalance,
        interestRate: l.interestRate,
        holdingTrust: l.holdingTrust,
        property: asset
          ? {
              name: l.securityProperty?.address ?? l.securityCommercialProperty?.name ?? asset.name,
              value: asset.currentValue,
              route: l.securityProperty ? `/properties/${l.securityProperty.id}` : `/commercial-properties/${l.securityCommercialProperty!.id}`,
              rentSource: l.securityProperty ? "weekly rent on the property page" : "active leases",
            }
          : null,
        lvr: asset?.currentValue && l.currentBalance ? l.currentBalance / asset.currentValue : null,
        annualRent: rent,
        annualRepayments: repayments,
        rentCover: rent !== null && repayments ? rent / repayments : null,
        startDate: l.startDate,
        propertyWarning,
      };
    });

    // Compliance checks: things an auditor would pick up.
    const checks: string[] = [];
    const listed = members.filter((m) => m.isMember);
    if (listed.length > MAX_MEMBERS) checks.push(`An SMSF can have at most ${MAX_MEMBERS} members; ${listed.length} are recorded.`);
    if (!details?.trusteeType) checks.push("Record whether the fund has individual trustees or a trustee company.");
    if (details?.trusteeType === "INDIVIDUAL") {
      for (const m of listed.filter((m) => !m.isTrustee)) checks.push(`${m.name} is a member but not recorded as a trustee — every member must be one.`);
      const trustees = fund.personRelationships.filter((r) => r.relationshipType === "TRUSTEE").length;
      if (listed.length === 1 && trustees < 2) checks.push("A one-member fund with individual trustees needs two trustees (or a trustee company).");
    }
    if (details?.trusteeType === "CORPORATE") {
      if (!company) checks.push("Choose the trustee company.");
      else for (const m of listed.filter((m) => !m.isDirector)) checks.push(`${m.name} is a member but not recorded as a director of ${company.name} — every member must be one.`);
    }
    if (!details?.auditorName) checks.push("Record the fund's approved SMSF auditor.");
    const reviewed = details?.strategyReviewedOn;
    if (!reviewed) checks.push("No investment strategy review recorded.");
    else if (today.getTime() - reviewed.getTime() > 366 * 86_400_000) checks.push("The investment strategy hasn't been reviewed in the last year.");
    for (const m of members) {
      if (m.concessional.remaining < 0) checks.push(`${m.name} is over the concessional cap for ${year}.`);
      if (m.nonConcessional.remaining < 0) checks.push(`${m.name} is over the non-concessional cap for ${year}.`);
      if (m.transferBalance && m.transferBalance.used > m.transferBalance.cap) checks.push(`${m.name}'s pensions started with more than the transfer balance cap.`);
    }
    for (const l of lrba.filter((l) => l.propertyWarning?.level === "WARNING")) checks.push(`${l.name}: ${l.propertyWarning!.note}`);
    for (const p of pensions.filter((p) => p.overMaximum)) checks.push(`${p.personName}'s transition to retirement pension has paid more than its 10% maximum this year.`);

    const earliest = [
      fund.establishmentDate ? fyLabelFor(fund.establishmentDate) : null,
      ...fund.smsfMemberYears.map((y) => y.fyLabel),
      ...contributions.filter((c) => c.fundId === fund.id).map((c) => fyLabelFor(c.date)),
    ].filter((x): x is string => !!x).sort()[0];
    const current = fyLabelFor(today);
    const years: string[] = [];
    for (let y = earliest && earliest < current ? earliest : shiftFy(current, -2); y <= current; y = shiftFy(y, 1)) years.push(y);

    res.json({
      fund: { id: fund.id, name: fund.name, abn: fund.abn, establishmentDate: fund.establishmentDate },
      year,
      years: years.reverse(),
      rules: rulesFor(year),
      details,
      nextReturnYear: nextReturnYear(fund, today),
      dates: fundDates(fund, today).sort((a, b) => a.date.getTime() - b.date.getTime()),
      checks,
      members,
      pensions,
      pensionShare,
      lrba,
      cash: sum(fund.accounts.map((a) => a.currentBalance ?? 0)),
      contributionSources: Object.keys(CONTRIBUTION_SOURCES),
    });
  })
);

// --- Trustee and compliance details ---------------------------------------------

const detailsInput = z.object({
  trusteeType: z.enum(["INDIVIDUAL", "CORPORATE"]).nullable().optional(),
  corporateTrusteeId: z.string().nullable().optional(),
  auditorName: z.string().nullable().optional(),
  auditorNumber: z.string().nullable().optional(),
  lodgedBy: z.enum(["TAX_AGENT", "SELF"]).nullable().optional(),
  lastReturnLodged: fyLabel.nullable().optional(),
  returnDueDate: isoDate.nullable().optional(),
  strategyReviewedOn: isoDate.nullable().optional(),
  notes: z.string().nullable().optional(),
});

smsfRouter.put(
  "/:fundId/details",
  asyncHandler(async (req, res) => {
    const fund = await requireFund(req.params.fundId);
    const parsed = detailsInput.parse(req.body);
    if (parsed.corporateTrusteeId) {
      const company = await prisma.entity.findUnique({ where: { id: parsed.corporateTrusteeId } });
      if (!company || company.entityType !== "COMPANY") throw new HttpError(400, "The trustee must be a company.");
    }
    const existing = await prisma.smsfDetails.findUnique({ where: { entityId: fund.id } });
    const data = {
      ...parsed,
      corporateTrusteeId: parsed.trusteeType === "INDIVIDUAL" ? null : parsed.corporateTrusteeId,
      returnDueDate: parsed.returnDueDate === undefined ? undefined : parsed.returnDueDate ? new Date(parsed.returnDueDate) : null,
      strategyReviewedOn:
        parsed.strategyReviewedOn === undefined ? undefined : parsed.strategyReviewedOn ? new Date(parsed.strategyReviewedOn) : null,
    };
    // Marking a return done moves on to the next one, so a due date entered
    // for the old one no longer applies.
    if (parsed.lastReturnLodged !== undefined && parsed.lastReturnLodged !== existing?.lastReturnLodged && parsed.returnDueDate === undefined) {
      data.returnDueDate = null;
    }
    const details = await prisma.smsfDetails.upsert({
      where: { entityId: fund.id },
      create: { entityId: fund.id, ...data },
      update: data,
    });
    await logAudit("SMSF_DETAILS_CHANGED", { targetType: "Entity", targetId: fund.id, data: parsed });
    res.json(details);
  })
);

// --- Members --------------------------------------------------------------------

smsfRouter.post(
  "/:fundId/members",
  asyncHandler(async (req, res) => {
    const fund = await requireFund(req.params.fundId);
    const { personId, trustee } = z.object({ personId: z.string(), trustee: z.boolean().optional() }).parse(req.body);
    const existing = await prisma.personEntityRelationship.findMany({ where: { entityId: fund.id } });
    const members = new Set(existing.filter((r) => r.relationshipType === "MEMBER").map((r) => r.personId));
    if (!members.has(personId) && members.size >= MAX_MEMBERS) {
      throw new HttpError(409, `An SMSF can have at most ${MAX_MEMBERS} members.`);
    }
    const add = (relationshipType: string) =>
      existing.some((r) => r.personId === personId && r.relationshipType === relationshipType)
        ? null
        : prisma.personEntityRelationship.create({ data: { personId, entityId: fund.id, relationshipType } });
    await Promise.all([add("MEMBER"), trustee ? add("TRUSTEE") : null]);
    await logAudit("SMSF_MEMBER_ADDED", { targetType: "Entity", targetId: fund.id, data: { personId } });
    res.status(201).json({ ok: true });
  })
);

smsfRouter.delete(
  "/:fundId/members/:personId",
  asyncHandler(async (req, res) => {
    const fund = await requireFund(req.params.fundId);
    const { personId } = req.params;
    const [years, contributions, pensions] = await Promise.all([
      prisma.smsfMemberYear.count({ where: { fundId: fund.id, personId } }),
      prisma.superContribution.count({ where: { fundId: fund.id, personId } }),
      prisma.smsfPension.count({ where: { fundId: fund.id, personId } }),
    ]);
    if (years + contributions + pensions > 0) {
      throw new HttpError(
        409,
        "This member has balances, contributions or pensions recorded in the fund, so they stay listed. Delete those first if they were entered by mistake."
      );
    }
    await prisma.personEntityRelationship.deleteMany({ where: { entityId: fund.id, personId, relationshipType: { in: ["MEMBER", "TRUSTEE"] } } });
    await logAudit("SMSF_MEMBER_REMOVED", { targetType: "Entity", targetId: fund.id, data: { personId } });
    res.status(204).send();
  })
);

const memberYearInput = z.object({
  personId: z.string(),
  fyLabel,
  closingBalance: z.number().min(0),
  taxFreeComponent: z.number().min(0).nullable().optional(),
  totalSuperBalance: z.number().min(0).nullable().optional(),
});

smsfRouter.put(
  "/:fundId/member-years",
  asyncHandler(async (req, res) => {
    const fund = await requireFund(req.params.fundId);
    const parsed = memberYearInput.parse(req.body);
    if (parsed.taxFreeComponent && parsed.taxFreeComponent > parsed.closingBalance) {
      throw new HttpError(400, "The tax-free part can't be more than the balance.");
    }
    const key = { fundId_personId_fyLabel: { fundId: fund.id, personId: parsed.personId, fyLabel: parsed.fyLabel } };
    const row = await prisma.smsfMemberYear.upsert({
      where: key,
      create: { fundId: fund.id, ...parsed },
      update: parsed,
    });
    res.json(row);
  })
);

smsfRouter.delete(
  "/member-years/:id",
  asyncHandler(async (req, res) => {
    await prisma.smsfMemberYear.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// --- Contributions -----------------------------------------------------------------

const contributionInput = z.object({
  personId: z.string(),
  date: isoDate,
  amount: z.number().positive(),
  source: z.enum(Object.keys(CONTRIBUTION_SOURCES) as [string, ...string[]]),
  paidIntoOtherFund: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

smsfRouter.post(
  "/:fundId/contributions",
  asyncHandler(async (req, res) => {
    const fund = await requireFund(req.params.fundId);
    const parsed = contributionInput.parse(req.body);
    const row = await prisma.superContribution.create({
      data: { ...parsed, fundId: fund.id, date: new Date(parsed.date), paidIntoOtherFund: parsed.paidIntoOtherFund?.trim() || null },
    });
    await logAudit("SUPER_CONTRIBUTION_ADDED", { targetType: "Entity", targetId: fund.id, data: { amount: row.amount, source: row.source } });
    res.status(201).json(row);
  })
);

smsfRouter.delete(
  "/contributions/:id",
  asyncHandler(async (req, res) => {
    await prisma.superContribution.delete({ where: { id: req.params.id } });
    await logAudit("SUPER_CONTRIBUTION_DELETED", { targetType: "SuperContribution", targetId: req.params.id });
    res.status(204).send();
  })
);

// --- Pensions ---------------------------------------------------------------------

const pensionInput = z.object({
  personId: z.string(),
  kind: z.enum(["ACCOUNT_BASED", "TRANSITION_TO_RETIREMENT"]),
  startDate: isoDate,
  startBalance: z.number().positive(),
  endDate: isoDate.nullable().optional(),
  notes: z.string().nullable().optional(),
});

const pensionDates = <T extends { startDate?: string; endDate?: string | null }>(p: T) => ({
  ...p,
  startDate: p.startDate ? new Date(p.startDate) : undefined,
  endDate: p.endDate === undefined ? undefined : p.endDate ? new Date(p.endDate) : null,
});

smsfRouter.post(
  "/:fundId/pensions",
  asyncHandler(async (req, res) => {
    const fund = await requireFund(req.params.fundId);
    const parsed = pensionInput.parse(req.body);
    const pension = await prisma.smsfPension.create({ data: { ...pensionDates(parsed), startDate: new Date(parsed.startDate), fundId: fund.id } });
    await logAudit("SMSF_PENSION_STARTED", { targetType: "Entity", targetId: fund.id, data: { kind: pension.kind } });
    res.status(201).json(pension);
  })
);

smsfRouter.put(
  "/pensions/:id",
  asyncHandler(async (req, res) => {
    const parsed = pensionInput.omit({ personId: true }).partial().parse(req.body);
    const pension = await prisma.smsfPension.update({ where: { id: req.params.id }, data: pensionDates(parsed) });
    res.json(pension);
  })
);

smsfRouter.delete(
  "/pensions/:id",
  asyncHandler(async (req, res) => {
    const payments = await prisma.smsfPensionPayment.count({ where: { pensionId: req.params.id } });
    if (payments > 0) {
      throw new HttpError(
        409,
        `This pension can't be deleted because it still has ${payments} payment${payments === 1 ? "" : "s"} recorded. If it has stopped, set the date it ended instead.`
      );
    }
    await prisma.smsfPension.delete({ where: { id: req.params.id } });
    await logAudit("SMSF_PENSION_DELETED", { targetType: "SmsfPension", targetId: req.params.id });
    res.status(204).send();
  })
);

smsfRouter.put(
  "/pensions/:id/balances",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ fyLabel, openingBalance: z.number().min(0) }).parse(req.body);
    const row = await prisma.smsfPensionBalance.upsert({
      where: { pensionId_fyLabel: { pensionId: req.params.id, fyLabel: parsed.fyLabel } },
      create: { pensionId: req.params.id, ...parsed },
      update: { openingBalance: parsed.openingBalance },
    });
    res.json(row);
  })
);

smsfRouter.post(
  "/pensions/:id/payments",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ date: isoDate, amount: z.number().positive(), notes: z.string().nullable().optional() }).parse(req.body);
    const row = await prisma.smsfPensionPayment.create({ data: { ...parsed, pensionId: req.params.id, date: new Date(parsed.date) } });
    res.status(201).json(row);
  })
);

smsfRouter.delete(
  "/pension-payments/:id",
  asyncHandler(async (req, res) => {
    await prisma.smsfPensionPayment.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
