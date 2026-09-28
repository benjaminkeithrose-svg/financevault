import { Router } from "express";
import { z } from "zod";
import { prismaAll } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { checkOwners, ownersInput } from "../services/ownership.js";
import { assess, workingAssessment } from "../services/assessment.js";
import { addItem, CHECK_STATUSES, dueDiligence, ensureCheck, removeItem, saveCheck } from "../services/dueDiligence.js";

/**
 * Properties I'm considering: a property you're looking at buying is a
 * normal property record with status CONSIDERING, so nothing is re-entered
 * when it's bought — its status just changes to OWNED. Until then every
 * total leaves it out (db.ts). Passed-on ones stay, for reference.
 */

export const consideringRouter = Router();

export const STAGES = ["LOOKING", "INVESTIGATING", "OFFER", "CONTRACT", "SETTLEMENT"] as const;
const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

/** "12 Smith St, Dubbo NSW 2830" → suburb Dubbo, state NSW (either may be missing). */
export function placeFromAddress(address: string): { suburb: string | null; state: string | null } {
  const last = address.split(",").pop()!.trim();
  const words = last.split(/\s+/);
  const at = words.findIndex((w) => STATES.includes(w.toUpperCase()));
  if (at < 0) return { suburb: address.includes(",") ? last.replace(/\s+\d{4}$/, "") || null : null, state: null };
  const suburb = words.slice(0, at).join(" ");
  return { suburb: address.includes(",") && suburb ? suburb : null, state: words[at].toUpperCase() };
}

const include = {
  entity: { select: { id: true, name: true } },
  property: { select: { id: true, address: true, suburb: true, weeklyRent: true, kind: true } },
  commercialProperty: { select: { id: true, address: true, suburb: true, tenancies: { select: { rentPerAnnum: true } } } },
};

consideringRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const assets = await prismaAll.asset.findMany({
      where: { status: { in: ["CONSIDERING", "PASSED_ON"] }, assetType: { in: ["PROPERTY", "COMMERCIAL_PROPERTY"] } },
      include,
      orderBy: { createdAt: "desc" },
    });
    // Each card shows the expected column's yield and cash flow once it can be worked out.
    const expected = new Map<string, { grossYield: number | null; netYield: number | null; weeklyCash: number | null; afterTax: boolean } | null>();
    for (const a of assets) {
      const e = (await assess(a.id))?.columns[0].figures;
      expected.set(a.id, e && (e.grossYield !== null || e.netYield !== null) ? { grossYield: e.grossYield, netYield: e.netYield, weeklyCash: e.weeklyCash, afterTax: e.cashAfterTax !== null } : null);
    }
    res.json(
      assets.map((a) => {
        const residential = a.assetType === "PROPERTY";
        const rent = residential
          ? (a.property?.weeklyRent ?? 0) * 52
          : (a.commercialProperty?.tenancies ?? []).reduce((s, t) => s + (t.rentPerAnnum ?? 0), 0);
        return {
          assetId: a.id,
          id: residential ? a.property?.id : a.commercialProperty?.id,
          kind: residential ? "RESIDENTIAL" : "COMMERCIAL",
          route: residential ? `/properties/${a.property?.id}` : `/commercial-properties/${a.commercialProperty?.id}`,
          name: a.name,
          address: (residential ? a.property?.address : a.commercialProperty?.address) ?? a.name,
          suburb: (residential ? a.property?.suburb : a.commercialProperty?.suburb) ?? null,
          askingPrice: a.askingPrice,
          stage: a.pipelineStage ?? "LOOKING",
          status: a.status,
          passedOnAt: a.passedOnAt,
          passedOnReason: a.passedOnReason,
          owner: a.entity.name,
          // Until the assessment is filled in: rent (as entered) over the asking price.
          grossYield: rent > 0 && a.askingPrice ? rent / a.askingPrice : null,
          yearlyRent: rent > 0 ? rent : null,
          expected: expected.get(a.id) ?? null,
        };
      }),
    );
  }),
);

const addInput = z.object({
  kind: z.enum(["RESIDENTIAL", "COMMERCIAL"]),
  address: z.string().trim().min(1).max(200),
  askingPrice: z.number().nonnegative().optional().nullable(),
  entityId: z.string(),
  owners: ownersInput,
});

consideringRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { owners: ownersRaw, ...parsed } = addInput.parse(req.body);
    const owners = checkOwners(ownersRaw);
    const entityId = owners ? owners[0].entityId : parsed.entityId;
    const { suburb, state } = placeFromAddress(parsed.address);
    const created = await prismaAll.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          name: parsed.address,
          assetType: parsed.kind === "RESIDENTIAL" ? "PROPERTY" : "COMMERCIAL_PROPERTY",
          entityId,
          status: "CONSIDERING",
          pipelineStage: "LOOKING",
          askingPrice: parsed.askingPrice ?? null,
        },
      });
      if (owners) {
        await tx.assetOwnership.createMany({
          data: owners.map((o) => ({ assetId: asset.id, ownerEntityId: o.entityId, ownershipPercent: o.percent, ownershipType: "LEGAL" })),
        });
      }
      if (parsed.kind === "RESIDENTIAL") {
        // Bought to rent unless you say otherwise (How it's used, on its page).
        const p = await tx.property.create({
          data: { assetId: asset.id, entityId, address: parsed.address, suburb, state, use: "INVESTMENT" },
        });
        return { assetId: asset.id, id: p.id, route: `/properties/${p.id}` };
      }
      const c = await tx.commercialProperty.create({
        data: { assetId: asset.id, entityId, name: parsed.address, address: parsed.address, suburb, state, propertyTypes: "OTHER" },
      });
      return { assetId: asset.id, id: c.id, route: `/commercial-properties/${c.id}` };
    });
    await logAudit("CONSIDERING_ADDED", { targetType: "Asset", targetId: created.assetId });
    res.status(201).json(created);
  }),
);

async function considered(assetId: string) {
  const asset = await prismaAll.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status === "OWNED") throw new HttpError(404, "That property isn't one you're considering.");
  return asset;
}

consideringRouter.put(
  "/:assetId/stage",
  asyncHandler(async (req, res) => {
    const { stage } = z.object({ stage: z.enum(STAGES) }).parse(req.body);
    const asset = await considered(req.params.assetId);
    if (asset.status !== "CONSIDERING") throw new HttpError(400, "Bring it back first — it's been passed on.");
    await prismaAll.asset.update({ where: { id: asset.id }, data: { pipelineStage: stage } });
    await logAudit("CONSIDERING_STAGE", { targetType: "Asset", targetId: asset.id, data: { stage } });
    res.json({ stage });
  }),
);

consideringRouter.post(
  "/:assetId/pass",
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().max(2000).optional().nullable() }).parse(req.body);
    const asset = await considered(req.params.assetId);
    // Where it stopped is kept (its stage); everything else stays as it was.
    await prismaAll.asset.update({
      where: { id: asset.id },
      data: { status: "PASSED_ON", passedOnAt: new Date(), passedOnReason: reason || null },
    });
    await logAudit("CONSIDERING_PASSED_ON", { targetType: "Asset", targetId: asset.id });
    res.json({ status: "PASSED_ON" });
  }),
);

consideringRouter.post(
  "/:assetId/reconsider",
  asyncHandler(async (req, res) => {
    const asset = await considered(req.params.assetId);
    await prismaAll.asset.update({ where: { id: asset.id }, data: { status: "CONSIDERING", passedOnAt: null, passedOnReason: null } });
    await logAudit("CONSIDERING_BACK", { targetType: "Asset", targetId: asset.id });
    res.json({ status: "CONSIDERING" });
  }),
);

/** Bought: it becomes an owned property and counts from here on. */
export async function markBought(assetId: string, on = new Date(), price?: number | null) {
  const asset = await considered(assetId);
  if (asset.status !== "CONSIDERING") throw new HttpError(400, "Bring it back first — it's been passed on.");
  const cost = price ?? asset.acquisitionCost ?? asset.askingPrice ?? null;
  await prismaAll.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: "OWNED",
        pipelineStage: null,
        acquisitionDate: asset.acquisitionDate ?? on,
        acquisitionCost: cost,
        currentValue: asset.currentValue ?? cost,
      },
    });
    await tx.property.updateMany({
      where: { assetId: asset.id },
      data: { purchasePrice: cost, purchaseDate: asset.acquisitionDate ?? on, settlementDate: on },
    });
    await tx.commercialProperty.updateMany({
      where: { assetId: asset.id },
      data: { purchasePrice: cost, purchaseDate: asset.acquisitionDate ?? on, settlementDate: on },
    });
  });
  await logAudit("CONSIDERING_BOUGHT", { targetType: "Asset", targetId: asset.id });
}

consideringRouter.post(
  "/:assetId/bought",
  asyncHandler(async (req, res) => {
    const { price } = z.object({ price: z.number().nonnegative().optional().nullable() }).parse(req.body ?? {});
    await markBought(req.params.assetId, new Date(), price);
    res.json({ status: "OWNED" });
  }),
);

consideringRouter.get(
  "/:assetId/assessment",
  asyncHandler(async (req, res) => {
    const result = await assess(req.params.assetId);
    if (!result) throw new HttpError(404, "Property not found");
    res.json(result);
  })
);

const money = z.number().nonnegative().max(1e10).nullable().optional();
const pct = z.number().min(0).max(100).nullable().optional();
const weeks = z.number().min(0).max(52).nullable().optional();
const assessmentInput = z.object({
  price: money,
  lvrPercent: pct,
  stampDuty: money,
  otherCosts: money,
  repaymentType: z.enum(["IO", "PI"]).optional(),
  loanTermYears: z.number().int().min(1).max(40).nullable().optional(),
  advertisedYieldPercent: pct,
  expectedVacancyWeeks: weeks,
  expectedRatePercent: pct,
  conservativeRent: money,
  conservativeVacancyWeeks: weeks,
  conservativeCosts: money,
  conservativeRatePercent: pct,
  badRent: money,
  badVacancyWeeks: weeks,
  badCosts: money,
  badRatePercent: pct,
});

consideringRouter.put(
  "/:assetId/assessment",
  asyncHandler(async (req, res) => {
    const data = assessmentInput.parse(req.body);
    const asset = await prismaAll.asset.findUnique({ where: { id: req.params.assetId }, select: { id: true } });
    if (!asset) throw new HttpError(404, "Property not found");
    const working = await workingAssessment(asset.id);
    if (working) await prismaAll.propertyAssessment.update({ where: { id: working.id }, data });
    else await prismaAll.propertyAssessment.create({ data: { ...data, assetId: asset.id } });
    await logAudit("ASSESSMENT_CHANGED", { targetType: "Asset", targetId: asset.id });
    res.json(await assess(asset.id));
  })
);

// Due diligence: the checks, open issues and development ideas.
consideringRouter.get(
  "/:assetId/checks",
  asyncHandler(async (req, res) => {
    res.json(await dueDiligence(req.params.assetId));
  })
);

const checkKey = z.string().regex(/^[a-z0-9.:-]{1,60}$/);
const checkInput = z.object({
  status: z.enum(CHECK_STATUSES).optional(),
  findings: z.string().max(5000).nullable().optional(),
  cost: z.number().nonnegative().max(1e9).nullable().optional(),
  who: z.string().max(200).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  checked: z.boolean().optional(),
  problem: z.boolean().optional(),
  resolved: z.boolean().optional(),
  resolution: z.string().max(2000).nullable().optional(),
  label: z.string().trim().min(1).max(200).optional(),
});

consideringRouter.put(
  "/:assetId/checks/:key",
  asyncHandler(async (req, res) => {
    const key = checkKey.parse(req.params.key);
    await saveCheck(req.params.assetId, key, checkInput.parse(req.body));
    await logAudit("DUE_DILIGENCE_CHANGED", { targetType: "Asset", targetId: req.params.assetId, data: { key } });
    res.json(await dueDiligence(req.params.assetId));
  })
);

consideringRouter.post(
  "/:assetId/checks/:key/ensure",
  asyncHandler(async (req, res) => {
    const row = await ensureCheck(req.params.assetId, checkKey.parse(req.params.key));
    res.json({ id: row.id });
  })
);

consideringRouter.post(
  "/:assetId/checks",
  asyncHandler(async (req, res) => {
    const p = z
      .object({
        kind: z.enum(["CHECK", "ISSUE", "DEVELOPMENT"]),
        label: z.string().trim().min(1).max(200),
        group: z.string().trim().max(80).nullable().optional(),
        cost: z.number().nonnegative().max(1e9).nullable().optional(),
      })
      .parse(req.body);
    await addItem(req.params.assetId, p.kind, p.label, p.group, p.cost);
    res.status(201).json(await dueDiligence(req.params.assetId));
  })
);

consideringRouter.delete(
  "/:assetId/checks/:key",
  asyncHandler(async (req, res) => {
    await removeItem(req.params.assetId, checkKey.parse(req.params.key));
    res.json(await dueDiligence(req.params.assetId));
  })
);
