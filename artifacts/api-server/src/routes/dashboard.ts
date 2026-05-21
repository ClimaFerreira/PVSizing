import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, customersTable, systemsTable, panelsTable, invertersTable, batteriesTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { getCompanyId } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const [customersCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customersTable)
    .where(eq(customersTable.companyId, cid));

  const [systemsCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(systemsTable)
    .where(eq(systemsTable.companyId, cid));

  const [panelsCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(panelsTable)
    .where(eq(panelsTable.companyId, cid));

  const [invertersCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invertersTable)
    .where(eq(invertersTable.companyId, cid));

  const [batteriesCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(batteriesTable)
    .where(eq(batteriesTable.companyId, cid));

  const tiposResult = await db
    .select({
      label: customersTable.tipoCliente,
      count: sql<number>`count(*)::int`,
    })
    .from(customersTable)
    .where(eq(customersTable.companyId, cid))
    .groupBy(customersTable.tipoCliente);

  res.json(
    GetDashboardSummaryResponse.parse({
      totalClientes: customersCount?.count ?? 0,
      totalSistemas: systemsCount?.count ?? 0,
      totalPaineis: panelsCount?.count ?? 0,
      totalInversores: invertersCount?.count ?? 0,
      totalBaterias: batteriesCount?.count ?? 0,
      clientesPorTipo: tiposResult,
    })
  );
});

export default router;
