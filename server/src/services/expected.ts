import { prisma } from "../db.js";
import { financialYearBounds, financialYearLabelForDate } from "./financialYear.js";
import { landTaxByAsset } from "./landTax.js";

/**
 * "What's missing" (IDEAS.md idea 13): the insurance and paperwork that is
 * normal for what's recorded, checked against what's actually there.
 *
 * - RED: required, or effectively required (by law or by a lender).
 * - AMBER: normal for people in your position — worth checking.
 *
 * An insurance expectation is met by a policy of a fitting kind on the
 * asset or person. A document expectation is met by a document of that type
 * linked to the asset, person or entity (or filed against the owner), dated
 * in or filed to the financial year when it's a yearly one. Anything can be
 * set aside with a reason ("covered by the strata policy", "held in super")
 * — kept on record, and it stops flagging.
 */

export type Level = "RED" | "AMBER";

export interface Expectation {
  /** Stable id, used to set it aside: "ins:…" or "doc:…" (yearly ones end in the FY). */
  key: string;
  kind: "INSURANCE" | "DOCUMENT";
  label: string;
  level: Level;
  why: string;
  /** Yearly paperwork: the financial year it's for. */
  fyLabel: string | null;
  met: boolean;
  /** What meets it: a policy or document, with a link. */
  metBy: { label: string; route: string } | null;
  /** For a document: the type to file it as. For insurance: the policy kind to add. */
  addAs: string;
  dismissed: { reason: string; at: string } | null;
}

export interface ExpectationGroup {
  /** "asset:<id>", "person:<id>" or "entity:<id>" — the detail pages ask by this. */
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

/** Private health: above this, no hospital cover means the Medicare levy surcharge (single, 2025-26 and 2026-27). */
export const MLS_SINGLE_THRESHOLD = 101_000;

const ROAD_VEHICLES = ["CAR", "MOTORCYCLE", "CAMPERVAN"];
const WATERCRAFT = ["BOAT", "JET_SKI"];
const TOWED = ["CARAVAN", "TRAILER"];
const TRUSTS = ["TRUST", "UNIT_TRUST"];
const COMPANIES = ["COMPANY"];
const FUNDS = ["SMSF"];

/** The financial year the accountant is working on: the one that has most recently ended. */
export function lastCompletedFy(today = new Date()): string {
  const current = financialYearLabelForDate(today);
  const start = Number(current.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function ageOn(dob: Date | null, today: Date): number | null {
  if (!dob) return null;
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

type Doc = {
  id: string;
  documentType: string | null;
  originalFilename: string;
  entityId: string | null;
  documentDate: Date | null;
  uploadDate: Date;
  financialYear: { label: string } | null;
  links: Array<{ targetType: string; targetId: string }>;
};

export async function expectedChecklist(fyLabel?: string, today = new Date()): Promise<ExpectedResult> {
  const fy = fyLabel && /^\d{4}-\d{2}$/.test(fyLabel) ? fyLabel : lastCompletedFy(today);
  const { start, end } = financialYearBounds(fy);

  const [assets, people, entities, policies, identities, loans, documents, dismissals] = await Promise.all([
    prisma.asset.findMany({
      where: { disposalDate: null, parentAssetId: null },
      include: { property: true, commercialProperty: true, entity: { select: { id: true, name: true, entityType: true } }, ownerships: true },
    }),
    prisma.person.findMany({ orderBy: { name: "asc" } }),
    prisma.entity.findMany({ orderBy: { name: "asc" }, include: { personalFor: { select: { id: true } } } }),
    prisma.insurancePolicy.findMany({ select: { id: true, kind: true, insurer: true, assetId: true, personId: true, entityId: true, heldInSuper: true } }),
    prisma.identityRecord.findMany({ where: { kind: "PRIVATE_HEALTH" }, select: { id: true, personId: true, label: true } }),
    prisma.liability.findMany({ select: { id: true, name: true, securityPropertyId: true, securityCommercialPropertyId: true, securityAssetId: true, liabilityType: true } }),
    prisma.document.findMany({
      where: { documentType: { not: null } },
      select: {
        id: true,
        documentType: true,
        originalFilename: true,
        entityId: true,
        documentDate: true,
        uploadDate: true,
        financialYear: { select: { label: true } },
        links: { select: { targetType: true, targetId: true } },
      },
    }),
    prisma.expectationDismissal.findMany(),
  ]);
  const setAside = new Map(dismissals.map((d) => [d.key, d]));
  const entityTypes = new Map(entities.map((e) => [e.id, e.entityType]));

  const inYear = (d: Doc) =>
    d.financialYear ? d.financialYear.label === fy : d.documentDate ? d.documentDate >= start && d.documentDate <= end : false;

  /** A document of one of these types, tied to any of these targets (and in the year, for yearly ones). */
  function findDoc(types: string[], targets: Array<[string, string]>, ownerEntityIds: string[], yearly: boolean) {
    return documents.find(
      (d) =>
        types.includes(d.documentType!) &&
        (!yearly || inYear(d)) &&
        (d.links.some((l) => targets.some(([t, id]) => l.targetType === t && l.targetId === id)) ||
          (d.entityId !== null && ownerEntityIds.includes(d.entityId) && d.links.length === 0))
    );
  }

  function item(
    base: Omit<Expectation, "met" | "metBy" | "dismissed">,
    found: { label: string; route: string } | null | undefined
  ): Expectation {
    const d = setAside.get(base.key);
    return {
      ...base,
      met: !!found,
      metBy: found ?? null,
      dismissed: d && !found ? { reason: d.reason, at: d.createdAt.toISOString() } : null,
    };
  }

  const policyOn = (assetId: string | null, personId: string | null, kinds: string[]) => {
    const p = policies.find((x) => kinds.includes(x.kind) && ((assetId && x.assetId === assetId) || (personId && x.personId === personId)));
    return p ? { label: `${p.insurer ?? "Policy"} (${p.kind.replace(/_/g, " ").toLowerCase()})`, route: `/insurance/${p.id}` } : null;
  };
  const docLink = (d: Doc | undefined) => (d ? { label: d.originalFilename, route: `/documents/${d.id}` } : null);
  const insurance = (target: string, kinds: string[], label: string, level: Level, why: string, assetId: string | null, personId: string | null) =>
    item({ key: `ins:${kinds[0]}:${target}`, kind: "INSURANCE", label, level, why, fyLabel: null, addAs: kinds[0] }, policyOn(assetId, personId, kinds));
  const doc = (
    target: string,
    type: string,
    also: string[],
    label: string,
    level: Level,
    why: string,
    yearly: boolean,
    targets: Array<[string, string]>,
    owners: string[]
  ) =>
    item(
      { key: `doc:${type}:${target}${yearly ? `:${fy}` : ""}`, kind: "DOCUMENT", label, level, why, fyLabel: yearly ? fy : null, addAs: type },
      docLink(findDoc([type, ...also], targets, owners, yearly))
    );

  const groups: ExpectationGroup[] = [];

  // Land tax is only expected where there's some to pay.
  const landTax = landTaxByAsset(
    assets
      .filter((a) => a.property || a.commercialProperty)
      .map((a) => ({
        ...a,
        state: a.property?.state ?? a.commercialProperty?.state ?? null,
        address: a.property?.address ?? a.commercialProperty?.address ?? "",
      })),
    entityTypes
  );

  // ---- Residential property ------------------------------------------------
  for (const a of assets.filter((x) => x.property)) {
    const p = a.property!;
    const target = `asset:${a.id}`;
    const home = a.mainResidence === "FULL";
    const strata = (p.strataFees ?? 0) > 0;
    const smsf = FUNDS.includes(a.entity.entityType);
    const mortgaged = loans.some((l) => l.securityPropertyId === p.id);
    const targets: Array<[string, string]> = [
      ["PROPERTY", p.id],
      ["ASSET", a.id],
      ...loans.filter((l) => l.securityPropertyId === p.id).map((l): [string, string] => ["LIABILITY", l.id]),
    ];
    const owners = [a.entityId, ...a.ownerships.map((o) => o.ownerEntityId)];
    const items: Expectation[] = [];

    if (smsf && !strata) {
      items.push(insurance(target, ["BUILDING", "BUILDING_AND_CONTENTS", "LANDLORD"], "Building insurance, in the fund's (trustee's) name", "RED", "An SMSF property needs building cover in the trustee's name — the fund's auditor checks it, and the lender requires it on an LRBA loan.", a.id, null));
    }
    if (home) {
      if (strata) {
        items.push(insurance(target, ["CONTENTS", "BUILDING_AND_CONTENTS"], "Contents insurance", "AMBER", "The strata policy covers the building; your belongings aren't covered by it.", a.id, null));
      } else {
        items.push(
          insurance(target, ["BUILDING", "BUILDING_AND_CONTENTS"], "Building insurance", "RED", mortgaged ? "Your lender requires building cover while the loan is secured on the home." : "The building is usually the largest thing the family owns — uninsured, a fire or storm is a total loss.", a.id, null)
        );
        items.push(insurance(target, ["CONTENTS", "BUILDING_AND_CONTENTS"], "Contents insurance", "AMBER", "Normal for a home you live in.", a.id, null));
      }
    } else if (!smsf) {
      items.push(insurance(target, ["LANDLORD", "LANDLORD_CONTENTS"], strata ? "Landlord insurance (contents and rent default)" : "Landlord insurance", "RED", "Covers lost rent, tenant damage and liability — ordinary home insurance doesn't cover a tenanted property.", a.id, null));
      if (!strata) {
        items.push(insurance(target, ["BUILDING", "BUILDING_AND_CONTENTS"], "Building insurance", "RED", mortgaged ? "The lender requires building cover while the loan is secured on the property. Some landlord policies include it — if yours does, set this aside with that reason." : "Some landlord policies include building cover — if yours does, set this aside with that reason.", a.id, null));
      }
    }
    if (strata) {
      items.push(doc(target, "Strata Certificate of Currency", ["Insurance"], "Strata insurance certificate of currency", "AMBER", "Proof the strata scheme's building policy is current — lenders ask for it, and it's the building cover you rely on.", true, targets, owners));
    }

    // Yearly paperwork for a rental — what the accountant needs.
    if (!home) {
      items.push(doc(target, "Rental Statement", [], "End-of-year rental statement", "RED", "The rent received and the agent's fees for the year — the starting point of the rental schedule in the tax return.", true, targets, owners));
      items.push(doc(target, "Council Rates", [], "Council rates notice", "AMBER", "Deductible for a rental; the accountant needs the amount paid in the year.", true, targets, owners));
      items.push(doc(target, "Water Rates", [], "Water rates notices", "AMBER", "Deductible for a rental unless the tenant pays them.", true, targets, owners));
      const lt = landTax.get(a.id);
      if (lt?.amount && lt.amount > 0) {
        items.push(doc(target, "Land Tax", [], "Land tax assessment", "RED", `Land tax of about $${Math.round(lt.amount).toLocaleString("en-AU")} a year applies — the assessment shows the amount to claim.`, true, targets, owners));
      }
      items.push(doc(target, "Insurance", ["Home Insurance"], "Insurance schedule or renewal", "AMBER", "The premium is deductible; the schedule shows it and the period covered.", true, targets, owners));
      if (mortgaged) {
        items.push(doc(target, "Loan Statement", [], "Loan interest statement", "RED", "Interest is usually the largest deduction on a rental — the statement for the year shows it.", true, targets, owners));
      }
      items.push(doc(target, "Depreciation Schedule", ["Quantity Surveyor Report"], "Depreciation schedule", "AMBER", "Building write-off and fittings depreciation from a quantity surveyor — often thousands a year in deductions. Needed once.", false, targets, owners));
    }
    groups.push({ target, kind: "PROPERTY", name: a.name, route: `/properties/${p.id}`, items });
  }

  // ---- Commercial property -------------------------------------------------
  for (const a of assets.filter((x) => x.commercialProperty)) {
    const c = a.commercialProperty!;
    const target = `asset:${a.id}`;
    const targets: Array<[string, string]> = [
      ["COMMERCIAL_PROPERTY", c.id],
      ["ASSET", a.id],
      ...loans.filter((l) => l.securityCommercialPropertyId === c.id).map((l): [string, string] => ["LIABILITY", l.id]),
    ];
    const owners = [a.entityId, ...a.ownerships.map((o) => o.ownerEntityId)];
    const items: Expectation[] = [
      insurance(target, ["BUILDING", "BUSINESS"], "Building insurance", "RED", "Leases usually require the owner to insure the building; a lender does too.", a.id, null),
      insurance(target, ["PUBLIC_LIABILITY", "BUSINESS"], "Public liability", "RED", "An owner of commercial premises can be liable for injuries on the property — leases usually set a minimum cover.", a.id, null),
      doc(target, "Outgoings Statement", [], "Outgoings statement", "AMBER", "The year's outgoings and what tenants recovered — needed for the return and the tenants' reconciliation.", true, targets, owners),
    ];
    if (loans.some((l) => l.securityCommercialPropertyId === c.id)) {
      items.push(doc(target, "Loan Statement", [], "Loan interest statement", "RED", "The interest for the year — usually the largest deduction.", true, targets, owners));
    }
    groups.push({ target, kind: "COMMERCIAL_PROPERTY", name: c.name, route: `/commercial-properties/${c.id}`, items });
  }

  // ---- Vehicles, boats, caravans ------------------------------------------
  for (const a of assets.filter((x) => x.assetType === "VEHICLE")) {
    const target = `asset:${a.id}`;
    const type = a.vehicleType ?? "OTHER";
    const items: Expectation[] = [];
    if (ROAD_VEHICLES.includes(type)) {
      items.push(insurance(target, ["CTP"], "CTP green slip", "RED", "Compulsory third party insurance — in NSW a green slip is needed before the vehicle can be registered. (In most other states it's part of the rego.)", a.id, null));
      items.push(insurance(target, ["MOTOR"], "Comprehensive or third party property", "AMBER", "CTP only covers injuries to people. Damage to your car or someone else's isn't covered without this.", a.id, null));
    } else if (WATERCRAFT.includes(type)) {
      items.push(insurance(target, ["BOAT"], "Boat insurance", "AMBER", "Covers the boat and your liability on the water — many marinas require it.", a.id, null));
    } else if (TOWED.includes(type)) {
      items.push(insurance(target, ["CARAVAN", "MOTOR"], type === "TRAILER" ? "Trailer insurance" : "Caravan insurance", "AMBER", "The towing car's policy usually covers only liability while it's hitched — not damage to the van or trailer, or theft.", a.id, null));
    }
    if (items.length) groups.push({ target, kind: "VEHICLE", name: a.name, route: `/assets/${a.id}`, items });
  }

  // ---- People --------------------------------------------------------------
  const superByEntity = new Map<string, typeof assets>();
  for (const a of assets.filter((x) => x.assetType === "SUPERANNUATION")) {
    superByEntity.set(a.entityId, [...(superByEntity.get(a.entityId) ?? []), a]);
  }
  for (const person of people) {
    const age = ageOn(person.dateOfBirth, today);
    if (age !== null && age < 18) continue;
    const target = `person:${person.id}`;
    const owners = person.entityId ? [person.entityId] : [];
    const targets: Array<[string, string]> = [["PERSON", person.id], ...owners.map((id): [string, string] => ["ENTITY", id])];
    const income = (person.grossSalary ?? 0) + (person.variableIncome ?? 0);
    const items: Expectation[] = [];

    if (income > 0) {
      const health = identities.find((i) => i.personId === person.id);
      // Private health is recorded with the person's ID and cover records.
      const hospital = health ? { label: health.label ?? "Private health cover", route: `/people/${person.id}` } : null;
      if (income > MLS_SINGLE_THRESHOLD) {
        items.push(
          item(
            { key: `ins:PRIVATE_HEALTH:${target}`, kind: "INSURANCE", label: "Private hospital cover", level: "AMBER", why: `Income over $${MLS_SINGLE_THRESHOLD.toLocaleString("en-AU")} without hospital cover means the Medicare levy surcharge (1–1.5% of income). A family's threshold is higher — if you're covered as a family, set this aside.`, fyLabel: null, addAs: "PRIVATE_HEALTH" },
            hospital
          )
        );
      }
      items.push(insurance(target, ["LIFE", "TPD"], "Life and TPD cover", "AMBER", "Often held inside super by default — check the amount would clear the debts and support the family. If it's in super, record it with \"held in super\" ticked.", null, person.id));
      items.push(insurance(target, ["INCOME_PROTECTION"], "Income protection", "AMBER", "Pays part of your salary if illness or injury stops you working. Premiums outside super are tax-deductible.", null, person.id));
      items.push(doc(target, "PAYG Summary / Income Statement", [], "Income statement (from myGov)", "RED", "Marked \"tax ready\" by the employer after 30 June — the salary and tax withheld for the return.", true, targets, owners));
      if (hospital) {
        items.push(doc(target, "Private Health Statement", [], "Private health insurance tax statement", "AMBER", "Shows the rebate received and days covered — the return needs it (it's usually pre-filled, but worth checking).", true, targets, owners));
      }
    }
    for (const s of owners.flatMap((id) => superByEntity.get(id) ?? [])) {
      items.push(
        doc(`asset:${s.id}`, "Super Statement", [], `Super statement — ${s.name}`, "AMBER", "The yearly member statement: balance, contributions and insurance held in the fund. Needed for the contribution caps and any insurance review.", true, [...targets, ["ASSET", s.id]], owners)
      );
    }
    if (items.length) groups.push({ target, kind: "PERSON", name: person.name, route: `/people/${person.id}`, items });
  }

  // ---- Trusts, companies, funds -------------------------------------------
  for (const e of entities.filter((x) => !x.personalFor)) {
    const target = `entity:${e.id}`;
    const targets: Array<[string, string]> = [["ENTITY", e.id]];
    const items: Expectation[] = [];
    if (TRUSTS.includes(e.entityType) || e.entityType === "HOLDING_TRUST") {
      items.push(doc(target, "Trust Deed", [], "Trust deed (signed and stamped)", "RED", "The rules of the trust. Needed for every loan, by the accountant, and to prove who can do what.", false, targets, [e.id]));
    }
    if (TRUSTS.includes(e.entityType)) {
      items.push(doc(target, "Distribution Minutes", ["Distribution Statement (Trust)"], "Distribution resolution, made by 30 June", "RED", "The trustee must resolve who gets the income by 30 June (or earlier if the deed says so). Without it, the trustee can be taxed at the top rate on all of it.", true, targets, [e.id]));
    }
    if (COMPANIES.includes(e.entityType)) {
      items.push(doc(target, "Company Constitution", [], "Company constitution", "AMBER", "The company's rules — lenders and the accountant ask for it.", false, targets, [e.id]));
      items.push(doc(target, "ASIC Document", ["Annual Statement"], "ASIC annual statement", "AMBER", "ASIC sends it each year on the review date; the fee must be paid and details confirmed.", true, targets, [e.id]));
    }
    if (FUNDS.includes(e.entityType)) {
      items.push(doc(target, "Trust Deed", [], "Fund trust deed", "RED", "The fund's governing rules — the auditor checks the fund follows them.", false, targets, [e.id]));
      items.push(doc(target, "Financial Statement", [], "Financial statements and audit report", "RED", "An SMSF must be audited every year before its return is lodged.", true, targets, [e.id]));
    }
    if (items.length) groups.push({ target, kind: "ENTITY", name: e.name, route: `/entities/${e.id}`, items });
  }

  const all = groups.flatMap((g) => g.items);
  const current = Number(financialYearLabelForDate(today).slice(0, 4));
  const fyOptions = [0, 1, 2, 3].map((i) => {
    const y = current - i;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  });
  return {
    fyLabel: fy,
    fyOptions,
    groups,
    counts: {
      red: all.filter((i) => !i.met && !i.dismissed && i.level === "RED").length,
      amber: all.filter((i) => !i.met && !i.dismissed && i.level === "AMBER").length,
      met: all.filter((i) => i.met).length,
      setAside: all.filter((i) => i.dismissed).length,
    },
  };
}
