import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { smsfCalendarDates } from "../services/smsf.js";
import { policyKindLabel } from "./tree.js";
import { ESTATE_KINDS } from "./estate.js";

/**
 * Everything with an expiry or renewal date, in one list: ID documents and
 * cover, insurance and other document renewals, vehicle rego, warranties,
 * services due, lease expiries and rent reviews, fixed-rate loan periods, and
 * SMSF compliance dates (annual return, auditor, strategy review, pensions).
 * Also served as an .ics calendar file so the dates can go into Google,
 * Apple or Outlook calendars.
 */
export const calendarRouter = Router();

export type CalendarCategory = "ID" | "RENEWAL" | "VEHICLE" | "WARRANTY" | "SERVICE" | "LEASE" | "LOAN" | "SMSF" | "INSURANCE" | "ESTATE" | "REFERENCE";

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  category: CalendarCategory;
  title: string;
  detail: string | null;
  route: string;
}

const ID_LABELS: Record<string, string> = {
  PRIVATE_HEALTH: "Private health insurance",
  MEDICARE: "Medicare card",
  DRIVERS_LICENCE: "Driver's licence",
  PASSPORT: "Passport",
  BIRTH_CERTIFICATE: "Birth certificate",
  CITIZENSHIP: "Citizenship certificate",
  PROOF_OF_AGE: "Proof of age card",
  OTHER: "ID document",
};

// Dates are stored as UTC midnight from date pickers, so the UTC calendar
// day is the day that was entered.
function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function collectEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
  const range = { gte: from, lte: to };
  const [ids, docs, assets, maintenance, tenancies, loans, references] = await Promise.all([
    prisma.identityRecord.findMany({ where: { expiryDate: range }, include: { person: { select: { name: true } } } }),
    prisma.document.findMany({ where: { renewalDate: range, reviewStatus: { not: "ARCHIVED" } } }),
    prisma.asset.findMany({
      where: { OR: [{ registrationExpiry: range }, { warrantyExpiry: range }] },
    }),
    prisma.maintenanceRecord.findMany({ where: { nextDueDate: range }, include: { asset: { select: { id: true, name: true } } } }),
    prisma.tenancy.findMany({
      where: { OR: [{ leaseExpiry: range }, { nextRentReview: range }] },
      include: { commercialProperty: { select: { id: true, name: true } } },
    }),
    prisma.liability.findMany({ where: { OR: [{ fixedPeriodEnds: range }, { maturityDate: range }] } }),
    prisma.document.findMany({
      where: { referenceCheckBy: range, reviewStatus: { not: "ARCHIVED" } },
      select: { id: true, referenceCheckBy: true, referenceCode: true, originalFilename: true },
    }),
  ]);

  const events: CalendarEvent[] = [];
  const inRange = (d: Date | null) => d !== null && d >= from && d <= to;

  for (const r of ids) {
    events.push({
      id: `id-${r.id}`,
      date: day(r.expiryDate!),
      category: "ID",
      title: `${r.label || ID_LABELS[r.kind] || "ID"} expires — ${r.person.name}`,
      detail: r.issuer,
      route: `/people/${r.personId}`,
    });
  }
  // Tax references are checked together once a year, so they're one
  // reminder per date rather than dozens.
  const referencesByDay = new Map<string, typeof references>();
  for (const r of references) {
    const key = day(r.referenceCheckBy!);
    referencesByDay.set(key, [...(referencesByDay.get(key) ?? []), r]);
  }
  for (const [date, refs] of referencesByDay) {
    events.push({
      id: `reference-${date}`,
      date,
      category: "REFERENCE",
      title: refs.length === 1 ? `Check tax reference is still current — ${refs[0].referenceCode ?? refs[0].originalFilename}` : `Check ${refs.length} tax references are still current`,
      detail: "New guides and rates come out each July. The link pack has the current addresses.",
      route: refs.length === 1 ? `/documents/${refs[0].id}` : "/documents?reference=only",
    });
  }
  for (const d of docs) {
    events.push({
      id: `doc-${d.id}`,
      date: day(d.renewalDate!),
      category: "RENEWAL",
      title: `${d.documentType || "Document"} renewal — ${d.supplier || d.originalFilename}`,
      detail: d.amount ? `Last amount $${d.amount.toLocaleString("en-AU")}` : null,
      route: `/documents/${d.id}`,
    });
  }
  for (const a of assets) {
    if (inRange(a.registrationExpiry)) {
      events.push({
        id: `rego-${a.id}`,
        date: day(a.registrationExpiry!),
        category: "VEHICLE",
        title: `Rego due — ${a.name}`,
        detail: a.registration,
        route: `/assets/${a.id}`,
      });
    }
    if (inRange(a.warrantyExpiry)) {
      events.push({
        id: `warranty-${a.id}`,
        date: day(a.warrantyExpiry!),
        category: "WARRANTY",
        title: `Warranty ends — ${a.name}`,
        detail: [a.make, a.model].filter(Boolean).join(" ") || null,
        route: `/assets/${a.id}`,
      });
    }
  }
  for (const m of maintenance) {
    events.push({
      id: `service-${m.id}`,
      date: day(m.nextDueDate!),
      category: "SERVICE",
      title: `Service due — ${m.asset.name}`,
      detail: m.provider ? `Last done by ${m.provider}` : m.description,
      route: `/assets/${m.asset.id}`,
    });
  }
  for (const t of tenancies) {
    if (inRange(t.leaseExpiry)) {
      events.push({
        id: `lease-${t.id}`,
        date: day(t.leaseExpiry!),
        category: "LEASE",
        title: `Lease expires — ${t.tenantName}, ${t.commercialProperty.name}`,
        detail: null,
        route: `/commercial-properties/${t.commercialProperty.id}`,
      });
    }
    if (inRange(t.nextRentReview)) {
      events.push({
        id: `review-${t.id}`,
        date: day(t.nextRentReview!),
        category: "LEASE",
        title: `Rent review — ${t.tenantName}, ${t.commercialProperty.name}`,
        detail: t.reviewMechanism,
        route: `/commercial-properties/${t.commercialProperty.id}`,
      });
    }
  }
  for (const l of loans) {
    if (inRange(l.fixedPeriodEnds)) {
      events.push({
        id: `fixed-${l.id}`,
        date: day(l.fixedPeriodEnds!),
        category: "LOAN",
        title: `Fixed rate ends — ${l.name}`,
        detail: l.lender,
        route: `/liabilities/${l.id}`,
      });
    }
    if (inRange(l.maturityDate)) {
      events.push({
        id: `maturity-${l.id}`,
        date: day(l.maturityDate!),
        category: "LOAN",
        title: `Loan term ends — ${l.name}`,
        detail: l.lender,
        route: `/liabilities/${l.id}`,
      });
    }
  }

  const [policies, estate] = await Promise.all([
    prisma.insurancePolicy.findMany({
      where: { renewalDate: range },
      include: { asset: { select: { id: true, name: true } }, person: { select: { id: true, name: true } } },
    }),
    prisma.estateDocument.findMany({
      where: { OR: [{ expiryDate: range }, { reviewDate: range }] },
      include: { person: { select: { id: true, name: true } } },
    }),
  ]);
  for (const p of policies) {
    events.push({
      id: `policy-${p.id}`,
      date: day(p.renewalDate!),
      category: "INSURANCE",
      title: `${policyKindLabel(p.kind)} renews — ${p.asset?.name ?? p.person?.name ?? p.insurer ?? "policy"}`,
      detail: [p.insurer, p.premium ? `premium $${p.premium.toLocaleString("en-AU")}` : null].filter(Boolean).join(" · ") || null,
      route: `/insurance/${p.id}`,
    });
  }
  for (const e of estate) {
    const label = ESTATE_KINDS[e.kind] ?? "Estate paper";
    if (inRange(e.expiryDate)) {
      events.push({
        id: `estate-expiry-${e.id}`,
        date: day(e.expiryDate!),
        category: "ESTATE",
        title: `${label} lapses — ${e.person.name}`,
        detail: "Re-sign it before then so it stays binding.",
        route: `/people/${e.person.id}`,
      });
    }
    if (inRange(e.reviewDate)) {
      events.push({
        id: `estate-review-${e.id}`,
        date: day(e.reviewDate!),
        category: "ESTATE",
        title: `Review ${label.toLowerCase()} — ${e.person.name}`,
        detail: e.heldBy ? `Original held by ${e.heldBy}` : null,
        route: `/people/${e.person.id}`,
      });
    }
  }

  for (const d of await smsfCalendarDates(from, to)) {
    events.push({ id: `smsf-${d.fundId}-${d.key}`, date: day(d.date), category: "SMSF", title: d.title, detail: d.detail, route: `/entities/${d.fundId}` });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function rangeFromQuery(query: Record<string, unknown>) {
  const from = query.from ? new Date(String(query.from)) : new Date(Date.now() - 31 * 86_400_000);
  const to = query.to ? new Date(String(query.to)) : new Date(Date.now() + 2 * 365 * 86_400_000);
  return { from, to };
}

calendarRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = rangeFromQuery(req.query as Record<string, unknown>);
    res.json(await collectEvents(from, to));
  })
);

// --- iCalendar (.ics) --------------------------------------------------------

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes are folded, as the format requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function toIcs(events: CalendarEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Financial Vault//Expiries//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Financial Vault expiries",
  ];
  for (const e of events) {
    const start = e.date.replace(/-/g, "");
    const next = new Date(`${e.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      // A stable id, so importing the file again updates events instead of
      // duplicating them.
      `UID:${e.id}@financial-vault.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${day(next).replace(/-/g, "")}`,
      `SUMMARY:${escapeIcs(e.title)}`,
      ...(e.detail ? [`DESCRIPTION:${escapeIcs(e.detail)}`] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-P14D",
      `DESCRIPTION:${escapeIcs(e.title)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

calendarRouter.get(
  "/expiries.ics",
  asyncHandler(async (_req, res) => {
    // Everything from today on: past dates don't belong in someone's calendar.
    const today = new Date(`${day(new Date())}T00:00:00Z`);
    const events = await collectEvents(today, new Date(today.getTime() + 3 * 365 * 86_400_000));
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="financial-vault-expiries.ics"');
    res.send(toIcs(events));
  })
);
