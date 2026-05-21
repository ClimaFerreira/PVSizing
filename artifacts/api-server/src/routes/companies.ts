import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth, getCompanyId } from "../lib/auth";

const router: IRouter = Router();

const UpdateCompanyBody = z.object({
  nome: z.string().min(1).optional(),
  nif: z.string().nullable().optional(),
  morada: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  corPrimaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  corSecundaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  rodapeProposta: z.string().nullable().optional(),
});

router.get("/companies/me", requireAuth, async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, cid));
  if (!company) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return;
  }
  res.json(company);
});

router.put("/companies/me", requireAuth, async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) values[k] = v;
  }
  const [updated] = await db
    .update(companiesTable)
    .set(values)
    .where(eq(companiesTable.id, cid))
    .returning();
  res.json(updated);
});

export default router;
