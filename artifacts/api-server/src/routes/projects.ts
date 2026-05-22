import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import {
  ListProjectsResponse,
  CreateProjectBody,
  GetProjectParams,
  GetProjectResponse,
  UpdateProjectParams,
  UpdateProjectBody,
  UpdateProjectResponse,
  DeleteProjectParams,
} from "@workspace/api-zod";
import { getCompanyId } from "../lib/auth";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const rows = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.companyId, cid))
    .orderBy(desc(projectsTable.updatedAt));
  res.json(ListProjectsResponse.parse(rows.map(toProjectResponse)));
});

router.post("/projects", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const now = new Date();
  const [row] = await db
    .insert(projectsTable)
    .values({
      companyId: cid,
      nome: d.nome,
      customerId: d.customerId ?? null,
      morada: d.morada ?? null,
      panelId: d.panelId ?? null,
      numPaineis: d.numPaineis ?? null,
      potenciaKwp: d.potenciaKwp != null ? String(d.potenciaKwp) : null,
      inclinacao: d.inclinacao != null ? String(d.inclinacao) : null,
      azimute: d.azimute != null ? String(d.azimute) : null,
      orientacao: d.orientacao ?? null,
      layoutRows: d.layoutRows ?? null,
      layoutCols: d.layoutCols ?? null,
      mountType: d.mountType ?? null,
      notas: d.notas ?? null,
      status: d.status ?? "rascunho",
      draftData: (d.draftData ?? null) as Record<string, unknown> | null,
      currentStep: d.currentStep ?? 1,
      lastSavedAt: d.draftData ? now : null,
    })
    .returning();
  res.status(201).json(GetProjectResponse.parse(toProjectResponse(row)));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.companyId, cid)));
  if (!row) { res.status(404).json({ error: "Estudo não encontrado" }); return; }
  res.json(GetProjectResponse.parse(toProjectResponse(row)));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const now = new Date();
  const values: Record<string, unknown> = { updatedAt: now };
  if (d.nome !== undefined) values.nome = d.nome;
  if (d.customerId !== undefined) values.customerId = d.customerId;
  if (d.morada !== undefined) values.morada = d.morada;
  if (d.panelId !== undefined) values.panelId = d.panelId;
  if (d.numPaineis !== undefined) values.numPaineis = d.numPaineis;
  if (d.potenciaKwp !== undefined) values.potenciaKwp = d.potenciaKwp != null ? String(d.potenciaKwp) : null;
  if (d.inclinacao !== undefined) values.inclinacao = d.inclinacao != null ? String(d.inclinacao) : null;
  if (d.azimute !== undefined) values.azimute = d.azimute != null ? String(d.azimute) : null;
  if (d.orientacao !== undefined) values.orientacao = d.orientacao;
  if (d.layoutRows !== undefined) values.layoutRows = d.layoutRows;
  if (d.layoutCols !== undefined) values.layoutCols = d.layoutCols;
  if (d.mountType !== undefined) values.mountType = d.mountType;
  if (d.notas !== undefined) values.notas = d.notas;
  if (d.status !== undefined) values.status = d.status;
  if (d.draftData !== undefined) {
    values.draftData = d.draftData;
    values.lastSavedAt = now;
  }
  if (d.currentStep !== undefined) values.currentStep = d.currentStep;

  const [row] = await db
    .update(projectsTable)
    .set(values)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.companyId, cid)))
    .returning();
  if (!row) { res.status(404).json({ error: "Estudo não encontrado" }); return; }
  res.json(UpdateProjectResponse.parse(toProjectResponse(row)));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db
    .delete(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.companyId, cid)))
    .returning();
  if (!row) { res.status(404).json({ error: "Estudo não encontrado" }); return; }
  res.sendStatus(204);
});

// Duplicate an existing project (copies all fields, resets status, appends " (cópia)" to name)
router.post("/projects/:id/duplicate", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [src] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.companyId, cid)));
  if (!src) { res.status(404).json({ error: "Estudo não encontrado" }); return; }

  const [row] = await db
    .insert(projectsTable)
    .values({
      companyId: cid,
      nome: `${src.nome} (cópia)`,
      customerId: src.customerId,
      morada: src.morada,
      panelId: src.panelId,
      numPaineis: src.numPaineis,
      potenciaKwp: src.potenciaKwp,
      inclinacao: src.inclinacao,
      azimute: src.azimute,
      orientacao: src.orientacao,
      layoutRows: src.layoutRows,
      layoutCols: src.layoutCols,
      mountType: src.mountType,
      notas: src.notas,
      status: "rascunho",
      draftData: src.draftData,
      currentStep: src.currentStep,
      lastSavedAt: src.draftData ? new Date() : null,
    })
    .returning();
  res.status(201).json(GetProjectResponse.parse(toProjectResponse(row)));
});

function toProjectResponse(row: typeof projectsTable.$inferSelect) {
  return {
    ...row,
    potenciaKwp: row.potenciaKwp != null ? Number(row.potenciaKwp) : null,
    inclinacao: row.inclinacao != null ? Number(row.inclinacao) : null,
    azimute: row.azimute != null ? Number(row.azimute) : null,
    status: row.status,
    draftData: row.draftData,
    currentStep: row.currentStep,
    lastSavedAt: row.lastSavedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export default router;
