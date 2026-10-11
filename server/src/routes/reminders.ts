import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { logAudit } from "../services/audit.js";
import { deleteWithLinks } from "../services/deletion.js";
import { describeTargets, nextDue, REMINDER_TARGETS, REPEATS, targetOf } from "../services/reminders.js";

/**
 * Reminders the person sets: in the calendar until marked complete, linked
 * to what they're about, with files attached (document links of type
 * REMINDER). Completing a repeating one makes the next.
 */
export const remindersRouter = Router();

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "A date");
const input = z.object({
  title: z.string().trim().min(1, "Say what needs doing"),
  notes: z.string().nullable().optional(),
  dueDate: day,
  repeat: z.enum(REPEATS).optional(),
  targetType: z.enum(REMINDER_TARGETS).nullable().optional(),
  targetId: z.string().nullable().optional(),
});

const toDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);

async function withDetails<T extends { id: string; targetType: string | null; targetId: string | null }>(rows: T[]) {
  const targets = await describeTargets(rows);
  const files = await prisma.documentLink.groupBy({
    by: ["targetId"],
    where: { targetType: "REMINDER", targetId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const count = new Map(files.map((f) => [f.targetId, f._count._all]));
  return rows.map((r) => ({ ...r, target: targetOf(targets, r), fileCount: count.get(r.id) ?? 0 }));
}

remindersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { targetType, targetId, open } = req.query as Record<string, string | undefined>;
    const rows = await prisma.reminder.findMany({
      where: {
        ...(targetType && targetId ? { targetType, targetId } : {}),
        ...(open === "1" ? { completedAt: null } : {}),
      },
      orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueDate: "asc" }],
      take: 500,
    });
    res.json(await withDetails(rows));
  })
);

remindersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const r = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!r) throw new HttpError(404, "Reminder not found");
    res.json((await withDetails([r]))[0]);
  })
);

remindersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const p = input.parse(req.body);
    if (p.targetType && !p.targetId) throw new HttpError(400, "Choose what it's about.");
    const r = await prisma.reminder.create({
      data: {
        title: p.title,
        notes: p.notes?.trim() || null,
        dueDate: toDate(p.dueDate),
        repeat: p.repeat ?? "NONE",
        targetType: p.targetType ?? null,
        targetId: p.targetType ? p.targetId ?? null : null,
      },
    });
    await logAudit("REMINDER_ADDED", { targetType: "Reminder", targetId: r.id });
    res.status(201).json((await withDetails([r]))[0]);
  })
);

remindersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const p = input.partial().parse(req.body);
    const r = await prisma.reminder.update({
      where: { id: req.params.id },
      data: {
        ...(p.title !== undefined ? { title: p.title } : {}),
        ...(p.notes !== undefined ? { notes: p.notes?.trim() || null } : {}),
        ...(p.dueDate !== undefined ? { dueDate: toDate(p.dueDate) } : {}),
        ...(p.repeat !== undefined ? { repeat: p.repeat } : {}),
        ...(p.targetType !== undefined ? { targetType: p.targetType, targetId: p.targetType ? p.targetId ?? null : null } : {}),
      },
    });
    await logAudit("REMINDER_CHANGED", { targetType: "Reminder", targetId: r.id });
    res.json((await withDetails([r]))[0]);
  })
);

/** Done: it leaves the to-do list. A repeating one comes back on its next date. */
remindersRouter.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const { note } = z.object({ note: z.string().nullable().optional() }).parse(req.body ?? {});
    const r = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!r) throw new HttpError(404, "Reminder not found");
    if (r.completedAt) throw new HttpError(409, "It's already marked complete.");
    const done = await prisma.reminder.update({ where: { id: r.id }, data: { completedAt: new Date(), completeNote: note?.trim() || null } });
    const due = nextDue(r.dueDate, r.repeat);
    const next = due
      ? await prisma.reminder.create({
          data: { title: r.title, notes: r.notes, dueDate: due, repeat: r.repeat, targetType: r.targetType, targetId: r.targetId, previousId: r.id },
        })
      : null;
    await logAudit("REMINDER_COMPLETED", { targetType: "Reminder", targetId: r.id });
    res.json({ reminder: (await withDetails([done]))[0], next });
  })
);

/** Not done after all: back on the list, and the repeat it made is taken away again if untouched. */
remindersRouter.post(
  "/:id/reopen",
  asyncHandler(async (req, res) => {
    const r = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!r) throw new HttpError(404, "Reminder not found");
    const made = await prisma.reminder.findMany({ where: { previousId: r.id, completedAt: null } });
    for (const m of made) {
      const files = await prisma.documentLink.count({ where: { targetType: "REMINDER", targetId: m.id } });
      if (files === 0) await prisma.reminder.delete({ where: { id: m.id } });
    }
    const open = await prisma.reminder.update({ where: { id: r.id }, data: { completedAt: null, completeNote: null } });
    await logAudit("REMINDER_REOPENED", { targetType: "Reminder", targetId: r.id });
    res.json((await withDetails([open]))[0]);
  })
);

remindersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const r = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!r) throw new HttpError(404, "Reminder not found");
    await deleteWithLinks([{ type: "REMINDER", id: r.id }], (tx) => tx.reminder.delete({ where: { id: r.id } }));
    await logAudit("REMINDER_DELETED", { targetType: "Reminder", targetId: r.id });
    res.status(204).send();
  })
);
