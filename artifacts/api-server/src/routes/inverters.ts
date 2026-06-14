import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
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
import { getCompanyId } from "../lib/auth";
import {
  inferInverterNetworkType,
  inverterNetworkColumnsForWrite,
} from "../lib/inverter-network";

const router: IRouter = Router();

router.get("/inverters", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const inverters = await db.select().from(invertersTable).where(eq(invertersTable.companyId, cid)).orderBy(invertersTable.createdAt);
  res.json(ListInvertersResponse.parse(inverters.map(toInverterResponse)));
});

router.post("/inverters", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const parsed = CreateInverterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const network = inverterNetworkColumnsForWrite(d);
  const [inverter] = await db
    .insert(invertersTable)
    .values({
      companyId: cid,
      nome: d.nome,
      fabricante: d.fabricante,
      potenciaAc: String(d.potenciaAc),
      potenciaDcMax: String(d.potenciaDcMax),
      mpptMin: String(d.mpptMin),
      mpptMax: String(d.mpptMax),
      corrMaxMppt: String(d.corrMaxMppt),
      numMppt: d.numMppt,
      stringsPorMppt: d.stringsPorMppt,
      vdcMax: d.vdcMax != null ? String(d.vdcMax) : null,
      ...network,
    })
    .returning();
  res.status(201).json(GetInverterResponse.parse(toInverterResponse(inverter)));
});

router.get("/inverters/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = GetInverterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [inverter] = await db.select().from(invertersTable).where(and(eq(invertersTable.id, params.data.id), eq(invertersTable.companyId, cid)));
  if (!inverter) { res.status(404).json({ error: "Inversor não encontrado" }); return; }
  res.json(GetInverterResponse.parse(toInverterResponse(inverter)));
});

router.patch("/inverters/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = UpdateInverterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateInverterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
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
  if (d.vdcMax !== undefined) updateValues.vdcMax = d.vdcMax != null ? String(d.vdcMax) : null;
  const network = inverterNetworkColumnsForWrite(d);
  if (d.tipoRede !== undefined) updateValues.tipoRede = network.tipoRede;
  if (d.tensaoAcNominal !== undefined) updateValues.tensaoAcNominal = network.tensaoAcNominal;
  if (d.faixaTensaoAc !== undefined) updateValues.faixaTensaoAc = network.faixaTensaoAc;
  if (d.ligacaoRede !== undefined) updateValues.ligacaoRede = network.ligacaoRede;
  const [inverter] = await db
    .update(invertersTable)
    .set(updateValues)
    .where(and(eq(invertersTable.id, params.data.id), eq(invertersTable.companyId, cid)))
    .returning();
  if (!inverter) { res.status(404).json({ error: "Inversor não encontrado" }); return; }
  res.json(UpdateInverterResponse.parse(toInverterResponse(inverter)));
});

router.delete("/inverters/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = DeleteInverterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [inverter] = await db
    .delete(invertersTable)
    .where(and(eq(invertersTable.id, params.data.id), eq(invertersTable.companyId, cid)))
    .returning();
  if (!inverter) { res.status(404).json({ error: "Inversor não encontrado" }); return; }
  res.sendStatus(204);
});

function extraText(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function extraNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toInverterResponse(row: typeof invertersTable.$inferSelect) {
  const extra = row as typeof row & Record<string, unknown>;
  return {
    ...row,
    potenciaAc: Number(row.potenciaAc),
    potenciaDcMax: Number(row.potenciaDcMax),
    mpptMin: Number(row.mpptMin),
    mpptMax: Number(row.mpptMax),
    corrMaxMppt: Number(row.corrMaxMppt),
    vdcMax: row.vdcMax != null ? Number(row.vdcMax) : null,
    tipoRede: inferInverterNetworkType(row),
    tensaoAcNominal: row.tensaoAcNominal ?? "",
    faixaTensaoAc: row.faixaTensaoAc ?? "",
    ligacaoRede: row.ligacaoRede ?? "",
    frequenciaAc: extraText(extra, "frequenciaAc"),
    potenciaAparenteAc: extraNumber(extra, "potenciaAparenteAc"),
    correnteNominalAc: extraNumber(extra, "correnteNominalAc"),
    correnteMaxAc: extraNumber(extra, "correnteMaxAc"),
    fatorPotencia: extraText(extra, "fatorPotencia"),
    thdi: extraText(extra, "thdi"),
    correnteInjecaoDc: extraText(extra, "correnteInjecaoDc"),
    potenciaPvMax: extraNumber(extra, "potenciaPvMax"),
    potenciaDcNominal: extraNumber(extra, "potenciaDcNominal"),
    tensaoArranque: extraNumber(extra, "tensaoArranque"),
    tensaoNominalDc: extraText(extra, "tensaoNominalDc"),
    correnteCurtoCircuitoMppt: extraNumber(extra, "correnteCurtoCircuitoMppt"),
    bateriaTensaoRange: extraText(extra, "bateriaTensaoRange"),
    bateriaCorrenteCargaMax: extraNumber(extra, "bateriaCorrenteCargaMax"),
    bateriaCorrenteDescargaMax: extraNumber(extra, "bateriaCorrenteDescargaMax"),
    bateriaPotenciaCargaMax: extraNumber(extra, "bateriaPotenciaCargaMax"),
    bateriaPotenciaDescargaMax: extraNumber(extra, "bateriaPotenciaDescargaMax"),
    grauProtecao: extraText(extra, "grauProtecao"),
    comunicacao: extraText(extra, "comunicacao"),
    observacoesTecnicas: extraText(extra, "observacoesTecnicas"),
  };
}

export default router;
