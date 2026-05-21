import { db, companiesTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./logger";

interface SeedUser {
  email: string;
  pass: string;
  nome: string;
  companyName: string;
  companyDefaults: {
    nome: string;
    nif?: string;
    telefone?: string;
    morada?: string;
    corPrimaria: string;
    corSecundaria: string;
  };
}

const SEED_USERS: SeedUser[] = [
  {
    email: "geralmarciof@gmail.com",
    pass: "123456MF",
    nome: "Márcio Ferreira",
    companyName: "Márcio Ferreira",
    companyDefaults: {
      nome: "Márcio Ferreira",
      corPrimaria: "#0D2B45",
      corSecundaria: "#F5A623",
    },
  },
  {
    email: "pinheiro.iec@gmail.com",
    pass: "Pinheiro506505170",
    nome: "Pinheiro IEC",
    companyName: "Pinheiro Instalações Eléctricas e Canalizações Unipessoal Lda",
    companyDefaults: {
      nome: "Pinheiro Instalações Eléctricas e Canalizações Unipessoal Lda",
      nif: "506505170",
      telefone: "964 119 508",
      morada: "São Pedro do Sul",
      corPrimaria: "#1a3d5c",
      corSecundaria: "#e67e22",
    },
  },
];

/**
 * Idempotent bootstrap: ensures the multi-tenant session table, the two
 * canonical companies, and the two canonical users exist. Always re-syncs
 * the password hash so credentials stay in sync with the source code.
 * Logs only emails and outcomes — never passwords.
 */
export async function ensureBootstrapSeed(): Promise<void> {
  try {
    // Session store table (connect-pg-simple expects this).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      );
    `);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
        ) THEN
          ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
        END IF;
      END $$;
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);

    for (const u of SEED_USERS) {
      const [existingCompany] = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.nome, u.companyName))
        .limit(1);

      let companyId: number;
      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        const [created] = await db
          .insert(companiesTable)
          .values(u.companyDefaults)
          .returning();
        companyId = created.id;
        logger.info({ companyId, nome: u.companyName }, "bootstrap: created company");
      }

      const passwordHash = await bcrypt.hash(u.pass, 10);
      const [existingUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, u.email))
        .limit(1);

      if (existingUser) {
        await db
          .update(usersTable)
          .set({ passwordHash, companyId, nome: u.nome, role: "admin" })
          .where(eq(usersTable.id, existingUser.id));
        logger.info({ email: u.email, companyId, action: "updated" }, "bootstrap: user synced");
      } else {
        await db.insert(usersTable).values({
          email: u.email,
          passwordHash,
          nome: u.nome,
          companyId,
          role: "admin",
        });
        logger.info({ email: u.email, companyId, action: "created" }, "bootstrap: user created");
      }
    }
  } catch (err) {
    logger.error({ err }, "bootstrap seed failed");
  }
}
