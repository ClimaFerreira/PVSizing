import { db } from "@workspace/db";
import {
  companiesTable,
  usersTable,
  customersTable,
  panelsTable,
  invertersTable,
  batteriesTable,
  systemsTable,
  proposalsTable,
  invoiceUploadsTable,
  projectsTable,
  wizardDraftsTable,
} from "@workspace/db/schema";
import { sql, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  const existing = await db.select().from(companiesTable);
  let company1 = existing.find((c) => c.nome.includes("Márcio"));
  let company2 = existing.find((c) => c.nome.includes("Pinheiro"));

  if (!company1) {
    [company1] = await db
      .insert(companiesTable)
      .values({
        nome: "Márcio Ferreira",
        corPrimaria: "#0D2B45",
        corSecundaria: "#F5A623",
      })
      .returning();
    console.log("Created company:", company1.id, company1.nome);
  }
  if (!company2) {
    [company2] = await db
      .insert(companiesTable)
      .values({
        nome: "Pinheiro Instalações Eléctricas e Canalizações Unipessoal Lda",
        nif: "506505170",
        telefone: "964 119 508",
        morada: "São Pedro do Sul",
        corPrimaria: "#1a3d5c",
        corSecundaria: "#e67e22",
      })
      .returning();
    console.log("Created company:", company2.id, company2.nome);
  }

  const seedUsers: Array<{
    email: string;
    pass: string;
    nome: string;
    companyId: number;
  }> = [
    { email: "geralmarciof@gmail.com", pass: "123456MF", nome: "Márcio Ferreira", companyId: company1!.id },
    { email: "pinheiro.iec@gmail.com", pass: "Pinheiro506505170", nome: "Pinheiro IEC", companyId: company2!.id },
  ];

  for (const u of seedUsers) {
    const found = await db.select().from(usersTable).where(eq(usersTable.email, u.email));
    if (found.length === 0) {
      const hash = await bcrypt.hash(u.pass, 10);
      await db.insert(usersTable).values({
        email: u.email,
        passwordHash: hash,
        nome: u.nome,
        companyId: u.companyId,
        role: "admin",
      });
      console.log("Created user:", u.email);
    } else {
      console.log("User exists:", u.email);
    }
  }

  // Backfill: assign all existing rows without a companyId to company1 (Márcio).
  const defaultCompanyId = company1!.id;
  const tables = [
    { t: customersTable, name: "customers" },
    { t: panelsTable, name: "panels" },
    { t: invertersTable, name: "inverters" },
    { t: batteriesTable, name: "batteries" },
    { t: systemsTable, name: "systems" },
    { t: proposalsTable, name: "proposals" },
    { t: invoiceUploadsTable, name: "invoice_uploads" },
    { t: projectsTable, name: "projects" },
    { t: wizardDraftsTable, name: "wizard_drafts" },
  ];
  for (const { t, name } of tables) {
    const r = await db
      .update(t as never)
      .set({ companyId: defaultCompanyId } as never)
      .where(isNull((t as never as { companyId: never }).companyId))
      .returning({ id: (t as never as { id: never }).id });
    console.log(`Backfilled ${r.length} rows in ${name}`);
  }

  // Ensure session store table exists (connect-pg-simple format)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
    ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_pkey";
    ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
  console.log("Session table ready");

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
