import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, invertersTable } from "@workspace/db";
import {
  ListInvertersResponse,
  CreateInverterBody,
  GetInverterParams,
  GetInverterResponse,
  UpdateInverterParams,
  UpdateInverterBody,
  UpdateInverterResponse,
  DeleteInverterParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/inverters", async (req, res): Promise<void> => {
  const inverters = await db.select().from(invertersTable).orderBy(invertersTable.createdAt);
  res.json(ListInvertersResponse.parse(inverters.map(toInverterResponse)));
});

router.post("/inverters", async (req, res): Promise<void> => {
  const parsed = CreateInverterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const [inverter] = await db
    .insert(invertersTable)
    .values({
      nome: d.nome,
      fabricante: d.fabricante,
      potenciaAc: String(d.potenciaAc),
      potenciaDcMax: String(d.potenciaDcMax),
      mpptMin: String(d.mpptMin),
      mpptMax: String(d.mpptMax),
      corrMaxMppt: String(d.corrMaxMppt),
      numMppt: d.numMppt,
      stringsPorMppt: d.stringsPorMppt,
    })
    .returning();

  res.status(201).json(GetInverterResponse.parse(toInverterResponse(inverter)));
});

router.get("/inverters/:id", async (req, res): Promise<void> => {
  const params = GetInverterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [inverter] = await db
    .select()
    .from(invertersTable)
    .where(eq(invertersTable.id, params.data.id));

  if (!inverter) {
    res.status(404).json({ error: "Inversor não encontrado" });
    return;
  }

  res.json(GetInverterResponse.parse(toInverterResponse(inverter)));
});

router.patch("/inverters/:id", async (req, res): Promise<void> => {
  const params = UpdateInverterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateInverterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const updateValues: Record<string, unknown> = {};
  if (d.nome !== undefined) updateValues.nome = d.nome;
  if (d.fabricante !== undefined) updateValues.fabricante = d.fabricante;
  if (d.potenciaAc !== undefined) updateValues.potenciaAc = String(d.potenciaAc);
  if (d.potenciaDcMax !== undefined) updateValues.potenciaDcMax = String(d.potenciaDcMax);
  if (d.mpptMin !== undefined) updateValues.mpptMin = String(d.mpptMin);
  if (d.mpptMax !== undefined) updateValues.mpptMax = String(d.mpptMax);
  if (d.corrMaxMppt !== undefined) updateValues.corrMaxMppt = String(d.corrMaxMppt);
  if (d.numMppt !== undefined) updateValues.numMppt = d.numMppt;
  if (d.stringsPorMppt !== undefined) updateValues.stringsPorMppt = d.stringsPorMppt;

  const [inverter] = await db
    .update(invertersTable)
    .set(updateValues)
    .where(eq(invertersTable.id, params.data.id))
    .returning();

  if (!inverter) {
    res.status(404).json({ error: "Inversor não encontrado" });
    return;
  }

  res.json(UpdateInverterResponse.parse(toInverterResponse(inverter)));
});

router.delete("/inverters/:id", async (req, res): Promise<void> => {
  const params = DeleteInverterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [inverter] = await db
    .delete(invertersTable)
    .where(eq(invertersTable.id, params.data.id))
    .returning();

  if (!inverter) {
    res.status(404).json({ error: "Inversor não encontrado" });
    return;
  }

  res.sendStatus(204);
});

function toInverterResponse(row: typeof invertersTable.$inferSelect) {
  return {
    ...row,
    potenciaAc: Number(row.potenciaAc),
    potenciaDcMax: Number(row.potenciaDcMax),
    mpptMin: Number(row.mpptMin),
    mpptMax: Number(row.mpptMax),
    corrMaxMppt: Number(row.corrMaxMppt),
  };
}

export default router;
