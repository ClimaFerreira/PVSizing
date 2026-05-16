import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, wizardDraftsTable } from "@workspace/db";

const router: IRouter = Router();

const SessionIdQuerySchema = z.object({
  sessionId: z.string().min(1).max(255).trim(),
});

const WizardDraftPutSchema = z.object({
  sessionId: z.string().min(1).max(255).trim(),
  step: z.number().int().min(1).max(20),
  data: z.record(z.unknown()),
});

// GET /wizard/draft?sessionId=xxx
router.get("/wizard/draft", async (req, res): Promise<void> => {
  const query = SessionIdQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "sessionId é obrigatório" });
    return;
  }

  const [row] = await db
    .select()
    .from(wizardDraftsTable)
    .where(eq(wizardDraftsTable.sessionId, query.data.sessionId))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Rascunho não encontrado" });
    return;
  }
  res.json(toResponse(row));
});

// PUT /wizard/draft — upsert
router.put("/wizard/draft", async (req, res): Promise<void> => {
  const body = WizardDraftPutSchema.safeParse(req.body);
  if (!body.success) {
    const msg = body.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: `Dados inválidos: ${msg}` });
    return;
  }

  const { sessionId, step, data } = body.data;
  const now = new Date();

  const [row] = await db
    .insert(wizardDraftsTable)
    .values({
      sessionId,
      step,
      data: data as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: wizardDraftsTable.sessionId,
      set: {
        step,
        data: data as Record<string, unknown>,
        updatedAt: now,
      },
    })
    .returning();

  res.json(toResponse(row));
});

// DELETE /wizard/draft?sessionId=xxx
router.delete("/wizard/draft", async (req, res): Promise<void> => {
  const query = SessionIdQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "sessionId é obrigatório" });
    return;
  }
  await db
    .delete(wizardDraftsTable)
    .where(eq(wizardDraftsTable.sessionId, query.data.sessionId));
  res.status(204).end();
});

function toResponse(row: typeof wizardDraftsTable.$inferSelect) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    step: row.step,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default router;
