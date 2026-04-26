import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, customersTable, systemsTable, panelsTable, invertersTable, batteriesTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [customersCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customersTable);

  const [systemsCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(systemsTable);

  const [panelsCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(panelsTable);

  const [invertersCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invertersTable);

  const [batteriesCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(batteriesTable);

  const tiposResult = await db
    .select({
      label: customersTable.tipoCliente,
      count: sql<number>`count(*)::int`,
    })
    .from(customersTable)
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
