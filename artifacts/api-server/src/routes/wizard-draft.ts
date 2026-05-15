import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, wizardDraftsTable } from "@workspace/db";

const router: IRouter = Router();

// GET /wizard/draft?sessionId=xxx
router.get("/wizard/draft", async (req, res): Promise<void> => {
  const { sessionId } = req.query as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId é obrigatório" });
    return;
  }
  const [row] = await db
    .select()
    .from(wizardDraftsTable)
    .where(eq(wizardDraftsTable.sessionId, sessionId))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Rascunho não encontrado" });
    return;
  }
  res.json(toResponse(row));
});

// PUT /wizard/draft — upsert
router.put("/wizard/draft", async (req, res): Promise<void> => {
  const body = req.body as { sessionId?: string; step?: number; data?: unknown };
  if (!body.sessionId || body.step == null || body.data == null) {
    res.status(400).json({ error: "sessionId, step e data são obrigatórios" });
    return;
  }

  const now = new Date();
  const [row] = await db
    .insert(wizardDraftsTable)
    .values({
      sessionId: body.sessionId,
      step: body.step,
      data: body.data as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: wizardDraftsTable.sessionId,
      set: {
        step: body.step,
        data: body.data as Record<string, unknown>,
        updatedAt: now,
      },
    })
    .returning();

  res.json(toResponse(row));
});

// DELETE /wizard/draft?sessionId=xxx
router.delete("/wizard/draft", async (req, res): Promise<void> => {
  const { sessionId } = req.query as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId é obrigatório" });
    return;
  }
  await db.delete(wizardDraftsTable).where(eq(wizardDraftsTable.sessionId, sessionId));
  res.status(204).end();
});

function toResponse(row: typeof wizardDraftsTable.$inferSelect) {
  return {
    id:        row.id,
    sessionId: row.sessionId,
    step:      row.step,
    data:      row.data,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default router;
