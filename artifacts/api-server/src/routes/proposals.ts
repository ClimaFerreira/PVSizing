import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, proposalsTable } from "@workspace/db";

const router: IRouter = Router();

// List all proposals
router.get("/proposals", async (_req, res): Promise<void> => {
  const proposals = await db.select().from(proposalsTable).orderBy(proposalsTable.createdAt);
  res.json(proposals.map(toResponse));
});

// Create a proposal
router.post("/proposals", async (req, res): Promise<void> => {
  const body = req.body as {
    titulo: string;
    customerId?: number | null;
    systemId?: number | null;
    consumoAnualEstimado?: number | null;
    potenciaRecomendada?: number | null;
    numPaineis?: number | null;
    panelId?: number | null;
    inverterId?: number | null;
    batteryId?: number | null;
    configuracaoStrings?: unknown;
    producaoAnualEstimada?: number | null;
    payback?: number | null;
    tir?: number | null;
    alertas?: string[];
  };

  if (!body.titulo) {
    res.status(400).json({ error: "titulo é obrigatório" });
    return;
  }

  const [proposal] = await db
    .insert(proposalsTable)
    .values({
      titulo: body.titulo,
      customerId: body.customerId ?? null,
      systemId: body.systemId ?? null,
      consumoAnualEstimado: body.consumoAnualEstimado != null ? String(body.consumoAnualEstimado) : null,
      potenciaRecomendada: body.potenciaRecomendada != null ? String(body.potenciaRecomendada) : null,
      numPaineis: body.numPaineis ?? null,
      panelId: body.panelId ?? null,
      inverterId: body.inverterId ?? null,
      batteryId: body.batteryId ?? null,
      configuracaoStrings: body.configuracaoStrings ?? null,
      producaoAnualEstimada: body.producaoAnualEstimada != null ? String(body.producaoAnualEstimada) : null,
      payback: body.payback != null ? String(body.payback) : null,
      tir: body.tir != null ? String(body.tir) : null,
      alertas: body.alertas ?? [],
      status: "rascunho",
    })
    .returning();

  res.status(201).json(toResponse(proposal));
});

// Get proposal by id
router.get("/proposals/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [proposal] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, id));
  if (!proposal) { res.status(404).json({ error: "Proposta não encontrada" }); return; }

  res.json(toResponse(proposal));
});

// Delete proposal
router.delete("/proposals/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(proposalsTable).where(eq(proposalsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Proposta não encontrada" }); return; }

  res.sendStatus(204);
});

function toResponse(p: typeof proposalsTable.$inferSelect) {
  return {
    ...p,
    consumoAnualEstimado: p.consumoAnualEstimado != null ? Number(p.consumoAnualEstimado) : null,
    potenciaRecomendada: p.potenciaRecomendada != null ? Number(p.potenciaRecomendada) : null,
    producaoAnualEstimada: p.producaoAnualEstimada != null ? Number(p.producaoAnualEstimada) : null,
    payback: p.payback != null ? Number(p.payback) : null,
    tir: p.tir != null ? Number(p.tir) : null,
  };
}

export default router;
