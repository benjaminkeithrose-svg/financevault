import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { businessUseSchedule, COST_FIELDS } from "../services/vehicleBusiness.js";

/**
 * A vehicle's business use: its logbooks, each year's odometer readings and
 * running costs, and the schedule for tax time (services/vehicleBusiness.ts).
 */
export const vehicleBusinessRouter = Router();

const fyLabel = z.string().regex(/^\d{4}-\d{2}$/, "A financial year like 2025-26");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "A date");
const km = z.number().min(0).nullable().optional();

const logbookInput = z.object({
  startDate: day,
  endDate: day,
  startOdometer: km,
  endOdometer: km,
  totalKm: km,
  businessKm: z.number().min(0),
  documentId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function logbookData(parsed: z.infer<typeof logbookInput>) {
  const startDate = new Date(`${parsed.startDate.slice(0, 10)}T00:00:00Z`);
  const endDate = new Date(`${parsed.endDate.slice(0, 10)}T00:00:00Z`);
  if (endDate < startDate) throw new HttpError(400, "The logbook's last day is before its first.");
  const fromOdometer =
    parsed.startOdometer != null && parsed.endOdometer != null ? parsed.endOdometer - parsed.startOdometer : null;
  if (fromOdometer !== null && fromOdometer < 0) throw new HttpError(400, "The odometer at the end is lower than at the start.");
  const totalKm = parsed.totalKm ?? fromOdometer;
  if (!totalKm) throw new HttpError(400, "Enter the odometer at the start and end, or the total kilometres.");
  if (parsed.businessKm > totalKm) throw new HttpError(400, "Business kilometres can't be more than the total.");
  return {
    startDate,
    endDate,
    startOdometer: parsed.startOdometer ?? null,
    endOdometer: parsed.endOdometer ?? null,
    totalKm,
    businessKm: parsed.businessKm,
    documentId: parsed.documentId ?? null,
    notes: parsed.notes ?? null,
  };
}

async function requireVehicle(id: string) {
  const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true, assetType: true } });
  if (!asset || asset.assetType !== "VEHICLE") throw new HttpError(404, "Vehicle not found");
  return asset;
}

vehicleBusinessRouter.get(
  "/:assetId/logbooks",
  asyncHandler(async (req, res) => {
    await requireVehicle(req.params.assetId);
    res.json(
      await prisma.vehicleLogbook.findMany({
        where: { assetId: req.params.assetId },
        orderBy: { startDate: "desc" },
        include: { document: { select: { id: true, originalFilename: true } } },
      })
    );
  })
);

vehicleBusinessRouter.post(
  "/:assetId/logbooks",
  asyncHandler(async (req, res) => {
    await requireVehicle(req.params.assetId);
    const data = logbookData(logbookInput.parse(req.body));
    const logbook = await prisma.vehicleLogbook.create({ data: { assetId: req.params.assetId, ...data } });
    if (data.documentId) await linkToVehicle(data.documentId, req.params.assetId);
    await logAudit("LOGBOOK_ADDED", { targetType: "Asset", targetId: req.params.assetId, data: { totalKm: data.totalKm, businessKm: data.businessKm } });
    res.status(201).json(logbook);
  })
);

vehicleBusinessRouter.put(
  "/logbooks/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.vehicleLogbook.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Logbook not found");
    const data = logbookData(logbookInput.parse(req.body));
    const logbook = await prisma.vehicleLogbook.update({ where: { id: existing.id }, data });
    if (data.documentId) await linkToVehicle(data.documentId, existing.assetId);
    await logAudit("LOGBOOK_CHANGED", { targetType: "Asset", targetId: existing.assetId, data: { totalKm: data.totalKm, businessKm: data.businessKm } });
    res.json(logbook);
  })
);

vehicleBusinessRouter.delete(
  "/logbooks/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.vehicleLogbook.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Logbook not found");
    await prisma.vehicleLogbook.delete({ where: { id: existing.id } });
    await logAudit("LOGBOOK_DELETED", { targetType: "Asset", targetId: existing.assetId });
    res.status(204).send();
  })
);

/** The logbook's scan also files under the vehicle, so it's in its folder and on its page. */
async function linkToVehicle(documentId: string, assetId: string) {
  const exists = await prisma.documentLink.findFirst({ where: { documentId, targetType: "ASSET", targetId: assetId } });
  if (!exists) await prisma.documentLink.create({ data: { documentId, targetType: "ASSET", targetId: assetId, label: "Logbook" } });
}

vehicleBusinessRouter.get(
  "/:assetId/schedule",
  asyncHandler(async (req, res) => {
    const fy = fyLabel.parse(req.query.fy);
    res.json(await businessUseSchedule(req.params.assetId, fy));
  })
);

const money = z.number().min(0).nullable().optional();
const yearInput = z.object({
  openingOdometer: money,
  closingOdometer: money,
  ...Object.fromEntries(COST_FIELDS.map((f) => [f.key, money])),
  declineInValue: money,
  businessPercent: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
});

vehicleBusinessRouter.put(
  "/:assetId/years/:fy",
  asyncHandler(async (req, res) => {
    await requireVehicle(req.params.assetId);
    const fy = fyLabel.parse(req.params.fy);
    const data = yearInput.parse(req.body) as Record<string, number | string | null | undefined>;
    if (data.openingOdometer != null && data.closingOdometer != null && Number(data.closingOdometer) < Number(data.openingOdometer)) {
      throw new HttpError(400, "The odometer at the end of the year is lower than at the start.");
    }
    await prisma.vehicleYear.upsert({
      where: { assetId_fyLabel: { assetId: req.params.assetId, fyLabel: fy } },
      create: { assetId: req.params.assetId, fyLabel: fy, ...data },
      update: data,
    });
    await logAudit("VEHICLE_YEAR_CHANGED", { targetType: "Asset", targetId: req.params.assetId, data: { fy } });
    res.json(await businessUseSchedule(req.params.assetId, fy));
  })
);

/**
 * A person's own car: put the year's logbook claim into their work
 * deductions (replacing the one put there before for this car and year).
 */
vehicleBusinessRouter.post(
  "/:assetId/schedule/:fy/work-deduction",
  asyncHandler(async (req, res) => {
    const fy = fyLabel.parse(req.params.fy);
    const s = await businessUseSchedule(req.params.assetId, fy);
    if (s.treatment !== "LOGBOOK" || !s.owner.personId) {
      throw new HttpError(400, "Only a car owned by a person goes into their work deductions.");
    }
    if (!s.businessPercent || s.claim <= 0) throw new HttpError(400, "There's no business share or no costs recorded for this year yet.");
    const description = `${s.asset.name} — logbook, ${s.businessPercent.toFixed(1)}% business use`;
    const existing = await prisma.workDeduction.findFirst({
      where: { personId: s.owner.personId, fyLabel: fy, category: "CAR", method: "LOGBOOK", description: { startsWith: `${s.asset.name} — logbook` } },
    });
    const data = {
      description,
      amount: s.claim,
      method: "LOGBOOK",
      quantity: s.businessKm,
      documentId: s.logbook?.document?.id ?? null,
      notes: `From the vehicle's business use schedule: ${s.totalCosts.toLocaleString("en-AU")} of costs × ${s.businessPercent.toFixed(1)}%.`,
    };
    const d = existing
      ? await prisma.workDeduction.update({ where: { id: existing.id }, data })
      : await prisma.workDeduction.create({ data: { personId: s.owner.personId, fyLabel: fy, category: "CAR", ...data } });
    await logAudit(existing ? "WORK_DEDUCTION_CHANGED" : "WORK_DEDUCTION_ADDED", {
      targetType: "WorkDeduction",
      targetId: d.id,
      data: { category: "CAR", amount: d.amount },
    });
    res.status(existing ? 200 : 201).json(d);
  })
);
