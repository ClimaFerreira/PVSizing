import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, panelsTable } from "@workspace/db";
import {
  ListPanelsResponse,
  CreatePanelBody,
  GetPanelParams,
  GetPanelResponse,
  UpdatePanelParams,
  UpdatePanelBody,
  UpdatePanelResponse,
  DeletePanelParams,
} from "@workspace/api-zod";
import { getCompanyId } from "../lib/auth";

const router: IRouter = Router();

router.get("/panels", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const panels = await db.select().from(panelsTable).where(eq(panelsTable.companyId, cid)).orderBy(panelsTable.createdAt);
  res.json(ListPanelsResponse.parse(panels.map(toPanelResponse)));
});

router.post("/panels", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const parsed = CreatePanelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [panel] = await db
    .insert(panelsTable)
    .values({
      companyId: cid,
      nome: d.nome,
      fabricante: d.fabricante,
      potencia: String(d.potencia),
      voc: String(d.voc),
      vmp: String(d.vmp),
      isc: String(d.isc),
      imp: String(d.imp),
      coeficienteTemperatura: String(d.coeficienteTemperatura),
      coeficienteTemperaturaVoc: d.coeficienteTemperaturaVoc != null ? String(d.coeficienteTemperaturaVoc) : null,
      noct: d.noct != null ? String(d.noct) : null,
      alturaMm: d.alturaMm ?? null,
      larguraMm: d.larguraMm ?? null,
    })
    .returning();
  res.status(201).json(GetPanelResponse.parse(toPanelResponse(panel)));
});

router.get("/panels/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = GetPanelParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [panel] = await db.select().from(panelsTable).where(and(eq(panelsTable.id, params.data.id), eq(panelsTable.companyId, cid)));
  if (!panel) { res.status(404).json({ error: "Painel não encontrado" }); return; }
  res.json(GetPanelResponse.parse(toPanelResponse(panel)));
});

router.patch("/panels/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = UpdatePanelParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePanelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updateValues: Record<string, unknown> = {};
  if (d.nome !== undefined) updateValues.nome = d.nome;
  if (d.fabricante !== undefined) updateValues.fabricante = d.fabricante;
  if (d.potencia !== undefined) updateValues.potencia = String(d.potencia);
  if (d.voc !== undefined) updateValues.voc = String(d.voc);
  if (d.vmp !== undefined) updateValues.vmp = String(d.vmp);
  if (d.isc !== undefined) updateValues.isc = String(d.isc);
  if (d.imp !== undefined) updateValues.imp = String(d.imp);
  if (d.coeficienteTemperatura !== undefined) updateValues.coeficienteTemperatura = String(d.coeficienteTemperatura);
  if (d.coeficienteTemperaturaVoc !== undefined) updateValues.coeficienteTemperaturaVoc = d.coeficienteTemperaturaVoc != null ? String(d.coeficienteTemperaturaVoc) : null;
  if (d.noct !== undefined) updateValues.noct = d.noct != null ? String(d.noct) : null;
  if (d.alturaMm !== undefined) updateValues.alturaMm = d.alturaMm;
  if (d.larguraMm !== undefined) updateValues.larguraMm = d.larguraMm;
  const [panel] = await db
    .update(panelsTable)
    .set(updateValues)
    .where(and(eq(panelsTable.id, params.data.id), eq(panelsTable.companyId, cid)))
    .returning();
  if (!panel) { res.status(404).json({ error: "Painel não encontrado" }); return; }
  res.json(UpdatePanelResponse.parse(toPanelResponse(panel)));
});

router.delete("/panels/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = DeletePanelParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [panel] = await db
    .delete(panelsTable)
    .where(and(eq(panelsTable.id, params.data.id), eq(panelsTable.companyId, cid)))
    .returning();
  if (!panel) { res.status(404).json({ error: "Painel não encontrado" }); return; }
  res.sendStatus(204);
});

function toPanelResponse(row: typeof panelsTable.$inferSelect) {
  return {
    ...row,
    potencia: Number(row.potencia),
    voc: Number(row.voc),
    vmp: Number(row.vmp),
    isc: Number(row.isc),
    imp: Number(row.imp),
    coeficienteTemperatura: Number(row.coeficienteTemperatura),
    coeficienteTemperaturaVoc: row.coeficienteTemperaturaVoc != null ? Number(row.coeficienteTemperaturaVoc) : null,
    noct: row.noct != null ? Number(row.noct) : null,
  };
}

export default router;
