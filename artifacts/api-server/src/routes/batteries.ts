import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, batteriesTable } from "@workspace/db";
import {
  ListBatteriesResponse,
  CreateBatteryBody,
  GetBatteryParams,
  GetBatteryResponse,
  UpdateBatteryParams,
  UpdateBatteryBody,
  UpdateBatteryResponse,
  DeleteBatteryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/batteries", async (req, res): Promise<void> => {
  const batteries = await db.select().from(batteriesTable).orderBy(batteriesTable.createdAt);
  res.json(ListBatteriesResponse.parse(batteries.map(toBatteryResponse)));
});

router.post("/batteries", async (req, res): Promise<void> => {
  const parsed = CreateBatteryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const [battery] = await db
    .insert(batteriesTable)
    .values({
      nome: d.nome,
      fabricante: d.fabricante,
      capacidade: String(d.capacidade),
      tensaoNominal: String(d.tensaoNominal),
      potenciaCarga: String(d.potenciaCarga),
      potenciaDescarga: String(d.potenciaDescarga),
      profundidadeDescarga: String(d.profundidadeDescarga),
      compatibilidade: d.compatibilidade ?? null,
    })
    .returning();

  res.status(201).json(GetBatteryResponse.parse(toBatteryResponse(battery)));
});

router.get("/batteries/:id", async (req, res): Promise<void> => {
  const params = GetBatteryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [battery] = await db
    .select()
    .from(batteriesTable)
    .where(eq(batteriesTable.id, params.data.id));

  if (!battery) {
    res.status(404).json({ error: "Bateria não encontrada" });
    return;
  }

  res.json(GetBatteryResponse.parse(toBatteryResponse(battery)));
});

router.patch("/batteries/:id", async (req, res): Promise<void> => {
  const params = UpdateBatteryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBatteryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const updateValues: Record<string, unknown> = {};
  if (d.nome !== undefined) updateValues.nome = d.nome;
  if (d.fabricante !== undefined) updateValues.fabricante = d.fabricante;
  if (d.capacidade !== undefined) updateValues.capacidade = String(d.capacidade);
  if (d.tensaoNominal !== undefined) updateValues.tensaoNominal = String(d.tensaoNominal);
  if (d.potenciaCarga !== undefined) updateValues.potenciaCarga = String(d.potenciaCarga);
  if (d.potenciaDescarga !== undefined) updateValues.potenciaDescarga = String(d.potenciaDescarga);
  if (d.profundidadeDescarga !== undefined) updateValues.profundidadeDescarga = String(d.profundidadeDescarga);
  if (d.compatibilidade !== undefined) updateValues.compatibilidade = d.compatibilidade ?? null;

  const [battery] = await db
    .update(batteriesTable)
    .set(updateValues)
    .where(eq(batteriesTable.id, params.data.id))
    .returning();

  if (!battery) {
    res.status(404).json({ error: "Bateria não encontrada" });
    return;
  }

  res.json(UpdateBatteryResponse.parse(toBatteryResponse(battery)));
});

router.delete("/batteries/:id", async (req, res): Promise<void> => {
  const params = DeleteBatteryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [battery] = await db
    .delete(batteriesTable)
    .where(eq(batteriesTable.id, params.data.id))
    .returning();

  if (!battery) {
    res.status(404).json({ error: "Bateria não encontrada" });
    return;
  }

  res.sendStatus(204);
});

function toBatteryResponse(row: typeof batteriesTable.$inferSelect) {
  return {
    id: row.id,
    nome: row.nome,
    fabricante: row.fabricante,
    capacidade: Number(row.capacidade),
    tensao: Number(row.tensaoNominal),
    tecnologia: "LiFePO4" as const,
    potenciaCarga: Number(row.potenciaCarga),
    potenciaDescarga: Number(row.potenciaDescarga),
    profundidadeDescarga: Number(row.profundidadeDescarga),
    compatibilidade: row.compatibilidade ?? null,
    createdAt: row.createdAt,
  };
}

export default router;
