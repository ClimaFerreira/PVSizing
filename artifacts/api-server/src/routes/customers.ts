import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import {
  ListCustomersResponse,
  CreateCustomerBody,
  GetCustomerParams,
  GetCustomerResponse,
  UpdateCustomerParams,
  UpdateCustomerBody,
  UpdateCustomerResponse,
  DeleteCustomerParams,
} from "@workspace/api-zod";
import { getCompanyId } from "../lib/auth";

const router: IRouter = Router();

router.get("/customers", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.companyId, cid))
    .orderBy(customersTable.createdAt);
  res.json(ListCustomersResponse.parse(customers.map(toCustomerResponse)));
});

router.post("/customers", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  const [customer] = await db
    .insert(customersTable)
    .values({
      companyId: cid,
      nome: data.nome,
      morada: data.morada,
      latitude: String(data.latitude),
      longitude: String(data.longitude),
      tipoCliente: data.tipoCliente,
      precoEletricidade: String(data.precoEletricidade),
      potenciaContratada: String(data.potenciaContratada),
      perfilConsumo: data.perfilConsumo,
      consumoMensal: data.consumoMensal != null ? String(data.consumoMensal) : null,
      consumoAnual: data.consumoAnual != null ? String(data.consumoAnual) : null,
    })
    .returning();
  res.status(201).json(GetCustomerResponse.parse(toCustomerResponse(customer)));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.companyId, cid)));
  if (!customer) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  res.json(GetCustomerResponse.parse(toCustomerResponse(customer)));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  const updateValues: Record<string, unknown> = {};
  if (data.nome !== undefined) updateValues.nome = data.nome;
  if (data.morada !== undefined) updateValues.morada = data.morada;
  if (data.latitude !== undefined) updateValues.latitude = String(data.latitude);
  if (data.longitude !== undefined) updateValues.longitude = String(data.longitude);
  if (data.tipoCliente !== undefined) updateValues.tipoCliente = data.tipoCliente;
  if (data.precoEletricidade !== undefined) updateValues.precoEletricidade = String(data.precoEletricidade);
  if (data.potenciaContratada !== undefined) updateValues.potenciaContratada = String(data.potenciaContratada);
  if (data.perfilConsumo !== undefined) updateValues.perfilConsumo = data.perfilConsumo;
  if (data.consumoMensal !== undefined) updateValues.consumoMensal = data.consumoMensal != null ? String(data.consumoMensal) : null;
  if (data.consumoAnual !== undefined) updateValues.consumoAnual = data.consumoAnual != null ? String(data.consumoAnual) : null;
  const [customer] = await db
    .update(customersTable)
    .set(updateValues)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.companyId, cid)))
    .returning();
  if (!customer) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  res.json(UpdateCustomerResponse.parse(toCustomerResponse(customer)));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [customer] = await db
    .delete(customersTable)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.companyId, cid)))
    .returning();
  if (!customer) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  res.sendStatus(204);
});

function toCustomerResponse(row: typeof customersTable.$inferSelect) {
  return {
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    precoEletricidade: Number(row.precoEletricidade),
    potenciaContratada: Number(row.potenciaContratada),
    consumoMensal: row.consumoMensal != null ? Number(row.consumoMensal) : null,
    consumoAnual: row.consumoAnual != null ? Number(row.consumoAnual) : null,
  };
}

export default router;
