import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, systemsTable } from "@workspace/db";
import {
  ListSystemsResponse,
  CreateSystemBody,
  GetSystemParams,
  GetSystemResponse,
  UpdateSystemParams,
  UpdateSystemBody,
  UpdateSystemResponse,
  DeleteSystemParams,
} from "@workspace/api-zod";
import { getCompanyId } from "../lib/auth";

const router: IRouter = Router();

router.get("/systems", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const systems = await db.select().from(systemsTable).where(eq(systemsTable.companyId, cid)).orderBy(systemsTable.createdAt);
  res.json(ListSystemsResponse.parse(systems.map(toSystemResponse)));
});

router.post("/systems", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const parsed = CreateSystemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [system] = await db
    .insert(systemsTable)
    .values({
      companyId: cid,
      customerId: d.customerId,
      panelId: d.panelId,
      inverterId: d.inverterId,
      batteryId: d.batteryId ?? null,
      numPaineis: d.numPaineis,
      paineisporstring: d.paineisporstring,
      numStrings: d.numStrings,
      inclinacao: String(d.inclinacao),
      azimute: String(d.azimute),
    })
    .returning();
  res.status(201).json(GetSystemResponse.parse(toSystemResponse(system)));
});

router.get("/systems/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = GetSystemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [system] = await db.select().from(systemsTable).where(and(eq(systemsTable.id, params.data.id), eq(systemsTable.companyId, cid)));
  if (!system) { res.status(404).json({ error: "Sistema não encontrado" }); return; }
  res.json(GetSystemResponse.parse(toSystemResponse(system)));
});

router.patch("/systems/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = UpdateSystemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSystemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updateValues: Record<string, unknown> = {};
  if (d.customerId !== undefined) updateValues.customerId = d.customerId;
  if (d.panelId !== undefined) updateValues.panelId = d.panelId;
  if (d.inverterId !== undefined) updateValues.inverterId = d.inverterId;
  if (d.batteryId !== undefined) updateValues.batteryId = d.batteryId ?? null;
  if (d.numPaineis !== undefined) updateValues.numPaineis = d.numPaineis;
  if (d.paineisporstring !== undefined) updateValues.paineisporstring = d.paineisporstring;
  if (d.numStrings !== undefined) updateValues.numStrings = d.numStrings;
  if (d.inclinacao !== undefined) updateValues.inclinacao = String(d.inclinacao);
  if (d.azimute !== undefined) updateValues.azimute = String(d.azimute);
  const [system] = await db
    .update(systemsTable)
    .set(updateValues)
    .where(and(eq(systemsTable.id, params.data.id), eq(systemsTable.companyId, cid)))
    .returning();
  if (!system) { res.status(404).json({ error: "Sistema não encontrado" }); return; }
  res.json(UpdateSystemResponse.parse(toSystemResponse(system)));
});

router.delete("/systems/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = DeleteSystemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [system] = await db
    .delete(systemsTable)
    .where(and(eq(systemsTable.id, params.data.id), eq(systemsTable.companyId, cid)))
    .returning();
  if (!system) { res.status(404).json({ error: "Sistema não encontrado" }); return; }
  res.sendStatus(204);
});

export function toSystemResponse(row: typeof systemsTable.$inferSelect) {
  return {
    ...row,
    inclinacao: Number(row.inclinacao),
    azimute: Number(row.azimute),
    batteryId: row.batteryId ?? null,
  };
}

export default router;
