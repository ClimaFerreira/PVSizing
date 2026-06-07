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

const router: IRouter = Router();
type TipoRedeInverter = "monofasico" | "trifasico" | "desconhecido";

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferTipoRede(row: { nome?: unknown; fabricante?: unknown; tipoRede?: unknown; tensaoAcNominal?: unknown; faixaTensaoAc?: unknown; ligacaoRede?: unknown }): TipoRedeInverter {
  const tecnico = normalizeText(`${row.tipoRede ??""} ${row.tensaoAcNominal ??""} ${row.faixaTensaoAc ??""} ${row.ligacaoRede ??""}`);
  if (/\b(3l|3p|3f)\s*\+?\s*n?\s*\+?\s*pe\b|3l\+n\+pe|3p\+n\+pe|trifas|three phase|\b380\s*\/\s*400\b|\b400\s*v\b/.test(tecnico)) return "trifasico";
  if (/\bl\s*\+\s*n\s*\+\s*pe\b|\b(1f|1p)\s*\+?\s*n?\s*\+?\s*pe\b|monofas|single phase|\b220\s*\/\s*230\b|\b230\s*v\b/.test(tecnico)) return "monofasico";

  const text = normalizeText(`${row.fabricante ??""} ${row.nome ??""}`);
  if (/\bsg05lp1\b|\blp1\b|\beu-am2\b/.test(text)) return "monofasico";
  if (/\bsg04lp3\b|\blp3\b|\b3p\b|\b3l\b|trifas/.test(text)) return "trifasico";
  return "desconhecido";
}

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function asDbNumber(value: unknown): string | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : null;
}

function advancedValues(d: Partial<Record<string, unknown>>) {
  const tipoRede = asText(d.tipoRede);
  const base = {
    tipoRede: tipoRede === "monofasico" || tipoRede === "trifasico" ? tipoRede : inferTipoRede(d),
    tensaoAcNominal: asText(d.tensaoAcNominal),
    faixaTensaoAc: asText(d.faixaTensaoAc),
    ligacaoRede: asText(d.ligacaoRede),
    frequenciaAc: asText(d.frequenciaAc),
    potenciaAparenteAc: asDbNumber(d.potenciaAparenteAc),
    correnteNominalAc: asDbNumber(d.correnteNominalAc),
    correnteMaxAc: asDbNumber(d.correnteMaxAc),
    fatorPotencia: asText(d.fatorPotencia),
    thdi: asText(d.thdi),
    correnteInjecaoDc: asText(d.correnteInjecaoDc),
    potenciaPvMax: asDbNumber(d.potenciaPvMax),
    potenciaDcNominal: asDbNumber(d.potenciaDcNominal),
    tensaoArranque: asDbNumber(d.tensaoArranque),
    tensaoNominalDc: asText(d.tensaoNominalDc),
    correnteCurtoCircuitoMppt: asDbNumber(d.correnteCurtoCircuitoMppt),
    bateriaTensaoRange: asText(d.bateriaTensaoRange),
    bateriaCorrenteCargaMax: asDbNumber(d.bateriaCorrenteCargaMax),
    bateriaCorrenteDescargaMax: asDbNumber(d.bateriaCorrenteDescargaMax),
    bateriaPotenciaCargaMax: asDbNumber(d.bateriaPotenciaCargaMax),
    bateriaPotenciaDescargaMax: asDbNumber(d.bateriaPotenciaDescargaMax),
    grauProtecao: asText(d.grauProtecao),
    comunicacao: asText(d.comunicacao),
    observacoesTecnicas: asText(d.observacoesTecnicas),
  };
  return base;
}

function advancedUpdateValues(d: Partial<Record<string, unknown>>) {
  const all = advancedValues(d);
  const update: Record<string, unknown> = {};
  for (const key of Object.keys(all) as Array<keyof typeof all>) {
    if (key in d) update[key] = all[key];
  }
  if (("tipoRede" in d || "tensaoAcNominal" in d || "faixaTensaoAc" in d || "ligacaoRede" in d) && !("tipoRede" in d)) {
    update.tipoRede = all.tipoRede;
  }
  return update;
}

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
      ...advancedValues(d),
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
  Object.assign(updateValues, advancedUpdateValues(d));
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

function toInverterResponse(row: typeof invertersTable.$inferSelect) {
  return {
    ...row,
    potenciaAc: Number(row.potenciaAc),
    potenciaDcMax: Number(row.potenciaDcMax),
    mpptMin: Number(row.mpptMin),
    mpptMax: Number(row.mpptMax),
    corrMaxMppt: Number(row.corrMaxMppt),
    vdcMax: row.vdcMax != null ? Number(row.vdcMax) : null,
    tipoRede: inferTipoRede(row),
    tensaoAcNominal: row.tensaoAcNominal ?? "",
    faixaTensaoAc: row.faixaTensaoAc ?? "",
    ligacaoRede: row.ligacaoRede ?? "",
    frequenciaAc: row.frequenciaAc ?? "",
    potenciaAparenteAc: row.potenciaAparenteAc != null ? Number(row.potenciaAparenteAc) : null,
    correnteNominalAc: row.correnteNominalAc != null ? Number(row.correnteNominalAc) : null,
    correnteMaxAc: row.correnteMaxAc != null ? Number(row.correnteMaxAc) : null,
    fatorPotencia: row.fatorPotencia ?? "",
    thdi: row.thdi ?? "",
    correnteInjecaoDc: row.correnteInjecaoDc ?? "",
    potenciaPvMax: row.potenciaPvMax != null ? Number(row.potenciaPvMax) : null,
    potenciaDcNominal: row.potenciaDcNominal != null ? Number(row.potenciaDcNominal) : null,
    tensaoArranque: row.tensaoArranque != null ? Number(row.tensaoArranque) : null,
    tensaoNominalDc: row.tensaoNominalDc ?? "",
    correnteCurtoCircuitoMppt: row.correnteCurtoCircuitoMppt != null ? Number(row.correnteCurtoCircuitoMppt) : null,
    bateriaTensaoRange: row.bateriaTensaoRange ?? "",
    bateriaCorrenteCargaMax: row.bateriaCorrenteCargaMax != null ? Number(row.bateriaCorrenteCargaMax) : null,
    bateriaCorrenteDescargaMax: row.bateriaCorrenteDescargaMax != null ? Number(row.bateriaCorrenteDescargaMax) : null,
    bateriaPotenciaCargaMax: row.bateriaPotenciaCargaMax != null ? Number(row.bateriaPotenciaCargaMax) : null,
    bateriaPotenciaDescargaMax: row.bateriaPotenciaDescargaMax != null ? Number(row.bateriaPotenciaDescargaMax) : null,
    grauProtecao: row.grauProtecao ?? "",
    comunicacao: row.comunicacao ?? "",
    observacoesTecnicas: row.observacoesTecnicas ?? "",
  };
}

export default router;
