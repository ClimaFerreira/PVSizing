import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
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
import { getCompanyId } from "../lib/auth";

const router: IRouter = Router();

const nullableNumber = (value: number | null | undefined): string | null =>
  value == null ? null : String(value);

const nullableInt = (value: number | null | undefined): number | null =>
  value == null ? null : Math.round(value);

const calcCapacidadeUtil = (capacidade: number, dod: number): number =>
  Math.round(capacidade * (dod / 100) * 100) / 100;

router.get("/batteries", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const batteries = await db.select().from(batteriesTable).where(eq(batteriesTable.companyId, cid)).orderBy(batteriesTable.createdAt);
  res.json(ListBatteriesResponse.parse(batteries.map(toBatteryResponse)));
});

router.post("/batteries", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const parsed = CreateBatteryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [battery] = await db
    .insert(batteriesTable)
    .values({
      companyId: cid,
      nome: d.nome,
      fabricante: d.fabricante,
      capacidade: String(d.capacidade),
      tensaoNominal: String(d.tensao ?? 48),
      tecnologia: d.tecnologia ?? "LiFePO4",
      potenciaCarga: String(d.potenciaCarga ?? 0),
      potenciaDescarga: String(d.potenciaDescarga ?? 0),
      profundidadeDescarga: String(d.profundidadeDescarga ?? 80),
      eficienciaRoundTrip: nullableNumber(d.eficienciaRoundTrip),
      ciclosVida: nullableInt(d.ciclosVida),
      correnteCargaMax: nullableNumber(d.correnteCargaMax),
      correnteDescargaMax: nullableNumber(d.correnteDescargaMax),
      capacidadeUtil: nullableNumber(
        d.capacidadeUtil ?? calcCapacidadeUtil(d.capacidade, d.profundidadeDescarga ?? 80),
      ),
      garantiaAnos: nullableInt(d.garantiaAnos),
      compatibilidade: d.compatibilidade ?? null,
      observacoesTecnicas: d.observacoesTecnicas ?? null,
    })
    .returning();
  res.status(201).json(GetBatteryResponse.parse(toBatteryResponse(battery)));
});

router.get("/batteries/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = GetBatteryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [battery] = await db.select().from(batteriesTable).where(and(eq(batteriesTable.id, params.data.id), eq(batteriesTable.companyId, cid)));
  if (!battery) { res.status(404).json({ error: "Bateria não encontrada" }); return; }
  res.json(GetBatteryResponse.parse(toBatteryResponse(battery)));
});

router.patch("/batteries/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = UpdateBatteryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateBatteryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updateValues: Record<string, unknown> = {};
  if (d.nome !== undefined) updateValues.nome = d.nome;
  if (d.fabricante !== undefined) updateValues.fabricante = d.fabricante;
  if (d.capacidade !== undefined) updateValues.capacidade = String(d.capacidade);
  if (d.tensao !== undefined) updateValues.tensaoNominal = String(d.tensao);
  if (d.tecnologia !== undefined) updateValues.tecnologia = d.tecnologia;
  if (d.potenciaCarga !== undefined) updateValues.potenciaCarga = String(d.potenciaCarga);
  if (d.potenciaDescarga !== undefined) updateValues.potenciaDescarga = String(d.potenciaDescarga);
  if (d.profundidadeDescarga !== undefined) updateValues.profundidadeDescarga = String(d.profundidadeDescarga);
  if (d.eficienciaRoundTrip !== undefined) updateValues.eficienciaRoundTrip = nullableNumber(d.eficienciaRoundTrip);
  if (d.ciclosVida !== undefined) updateValues.ciclosVida = nullableInt(d.ciclosVida);
  if (d.correnteCargaMax !== undefined) updateValues.correnteCargaMax = nullableNumber(d.correnteCargaMax);
  if (d.correnteDescargaMax !== undefined) updateValues.correnteDescargaMax = nullableNumber(d.correnteDescargaMax);
  if (d.capacidadeUtil !== undefined) updateValues.capacidadeUtil = nullableNumber(d.capacidadeUtil);
  if (d.garantiaAnos !== undefined) updateValues.garantiaAnos = nullableInt(d.garantiaAnos);
  if (d.compatibilidade !== undefined) updateValues.compatibilidade = d.compatibilidade;
  if (d.observacoesTecnicas !== undefined) updateValues.observacoesTecnicas = d.observacoesTecnicas;
  const [battery] = await db
    .update(batteriesTable)
    .set(updateValues)
    .where(and(eq(batteriesTable.id, params.data.id), eq(batteriesTable.companyId, cid)))
    .returning();
  if (!battery) { res.status(404).json({ error: "Bateria não encontrada" }); return; }
  res.json(UpdateBatteryResponse.parse(toBatteryResponse(battery)));
});

router.delete("/batteries/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = DeleteBatteryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [battery] = await db
    .delete(batteriesTable)
    .where(and(eq(batteriesTable.id, params.data.id), eq(batteriesTable.companyId, cid)))
    .returning();
  if (!battery) { res.status(404).json({ error: "Bateria não encontrada" }); return; }
  res.sendStatus(204);
});

function toBatteryResponse(row: typeof batteriesTable.$inferSelect) {
  const capacidade = Number(row.capacidade);
  const profundidadeDescarga = Number(row.profundidadeDescarga);
  const capacidadeUtil = row.capacidadeUtil != null
    ? Number(row.capacidadeUtil)
    : calcCapacidadeUtil(capacidade, profundidadeDescarga || 80);

  return {
    id: row.id,
    nome: row.nome,
    fabricante: row.fabricante,
    capacidade,
    tensao: Number(row.tensaoNominal),
    tecnologia: row.tecnologia as "LiFePO4" | "Li-ion" | "AGM" | "Gel",
    potenciaCarga: Number(row.potenciaCarga),
    potenciaDescarga: Number(row.potenciaDescarga),
    profundidadeDescarga,
    eficienciaRoundTrip: row.eficienciaRoundTrip != null ? Number(row.eficienciaRoundTrip) : null,
    ciclosVida: row.ciclosVida,
    correnteCargaMax: row.correnteCargaMax != null ? Number(row.correnteCargaMax) : null,
    correnteDescargaMax: row.correnteDescargaMax != null ? Number(row.correnteDescargaMax) : null,
    capacidadeUtil,
    garantiaAnos: row.garantiaAnos,
    compatibilidade: row.compatibilidade,
    observacoesTecnicas: row.observacoesTecnicas,
    createdAt: row.createdAt,
  };
}

export default router;
