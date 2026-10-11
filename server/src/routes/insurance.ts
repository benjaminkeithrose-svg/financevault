import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { deleteWithLinks } from "../services/deletion.js";
import { decryptField } from "../services/fieldCrypto.js";
import { maskNumber } from "./identity.js";
import { POLICY_KINDS } from "./tree.js";

/**
 * Insurance policies, each hung off what it covers — an asset (building,
 * landlord, car, boat) or a person (life, TPD, income protection) — and
 * owned by an entity. Renewals go into the expiry calendar. The policy
 * number is encrypted and shown masked.
 */
export const insuranceRouter = Router();

const input = z.object({
  kind: z.enum(Object.keys(POLICY_KINDS) as [string, ...string[]]),
  insurer: z.string().nullable().optional(),
  policyNumber: z.string().nullable().optional(),
  coverAmount: z.number().min(0).nullable().optional(),
  premium: z.number().min(0).nullable().optional(),
  premiumFrequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY"]).nullable().optional(),
  renewalDate: z.string().datetime().nullable().optional(),
  assetId: z.string().nullable().optional(),
  personId: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  heldInSuper: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const include = {
  asset: { select: { id: true, name: true, property: { select: { id: true } }, commercialProperty: { select: { id: true } } } },
  person: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true } },
};

async function withMasks<T extends { id: string }>(policies: T[]) {
  const secrets = await prisma.insurancePolicy.findMany({ where: { id: { in: policies.map((p) => p.id) } }, select: { id: true, policyNumber: true } });
  const byId = new Map(secrets.map((s) => [s.id, s.policyNumber]));
  const links = await prisma.documentLink.groupBy({
    by: ["targetId"],
    where: { targetType: "INSURANCE_POLICY", targetId: { in: policies.map((p) => p.id) } },
    _count: { _all: true },
  });
  const docs = new Map(links.map((l) => [l.targetId, l._count._all]));
  return policies.map((p) => ({ ...p, policyNumberMasked: maskNumber(decryptField(byId.get(p.id))), documentCount: docs.get(p.id) ?? 0 }));
}

function data(parsed: Partial<z.infer<typeof input>>) {
  return {
    ...parsed,
    policyNumber: parsed.policyNumber === "" ? null : parsed.policyNumber,
    renewalDate: parsed.renewalDate === undefined ? undefined : parsed.renewalDate ? new Date(parsed.renewalDate) : null,
  };
}

insuranceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { assetId, personId, entityId } = req.query as Record<string, string | undefined>;
    const where = assetId ? { assetId } : personId ? { personId } : entityId ? { entityId } : {};
    const policies = await prisma.insurancePolicy.findMany({ where, include, orderBy: [{ renewalDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] });
    res.json(await withMasks(policies));
  })
);

insuranceRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const policy = await prisma.insurancePolicy.findUnique({ where: { id: req.params.id }, include });
    if (!policy) throw new HttpError(404, "Policy not found");
    res.json((await withMasks([policy]))[0]);
  })
);

/** The full policy number, on request only — recorded in the audit log. */
insuranceRouter.get(
  "/:id/reveal",
  asyncHandler(async (req, res) => {
    const policy = await prisma.insurancePolicy.findUnique({ where: { id: req.params.id }, select: { policyNumber: true } });
    if (!policy) throw new HttpError(404, "Policy not found");
    await logAudit("POLICY_NUMBER_REVEALED", { targetType: "InsurancePolicy", targetId: req.params.id });
    res.json({ policyNumber: decryptField(policy.policyNumber) });
  })
);

insuranceRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = input.parse(req.body);
    if (!parsed.assetId && !parsed.personId && !parsed.entityId) {
      throw new HttpError(400, "Say what the policy covers — an asset or a person — or who holds it.");
    }
    const policy = await prisma.insurancePolicy.create({ data: data(parsed) as Parameters<typeof prisma.insurancePolicy.create>[0]["data"], include });
    await logAudit("POLICY_CREATED", { targetType: "InsurancePolicy", targetId: policy.id, data: { kind: policy.kind } });
    res.status(201).json((await withMasks([policy]))[0]);
  })
);

insuranceRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = input.partial().parse(req.body);
    const policy = await prisma.insurancePolicy.update({ where: { id: req.params.id }, data: data(parsed) as Parameters<typeof prisma.insurancePolicy.update>[0]["data"], include });
    await logAudit("POLICY_CHANGED", { targetType: "InsurancePolicy", targetId: policy.id });
    res.json((await withMasks([policy]))[0]);
  })
);

insuranceRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteWithLinks([{ type: "INSURANCE_POLICY", id: req.params.id }], (tx) => tx.insurancePolicy.delete({ where: { id: req.params.id } }));
    await logAudit("POLICY_DELETED", { targetType: "InsurancePolicy", targetId: req.params.id });
    res.status(204).send();
  })
);
