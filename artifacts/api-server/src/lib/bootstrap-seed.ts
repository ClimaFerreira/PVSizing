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

function getBootstrapUsers(): SeedUser[] {
  const usersJson = process.env["BOOTSTRAP_USERS_JSON"];
  if (usersJson) {
    const parsed = JSON.parse(usersJson) as SeedUser[];
    if (!Array.isArray(parsed)) {
      throw new Error("BOOTSTRAP_USERS_JSON must be an array");
    }
    return parsed;
  }

  const email = process.env["BOOTSTRAP_ADMIN_EMAIL"];
  const pass = process.env["BOOTSTRAP_ADMIN_PASSWORD"];
  if (!email || !pass) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required in production");
    }

    logger.warn(
      "bootstrap: no admin credentials configured; set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create a local login",
    );
    return [];
  }

  const companyName = process.env["BOOTSTRAP_COMPANY_NAME"] ?? "SolarDim";
  return [
    {
      email,
      pass,
      nome: process.env["BOOTSTRAP_ADMIN_NAME"] ?? "Administrador",
      companyName,
      companyDefaults: {
        nome: companyName,
        nif: process.env["BOOTSTRAP_COMPANY_NIF"],
        telefone: process.env["BOOTSTRAP_COMPANY_PHONE"],
        morada: process.env["BOOTSTRAP_COMPANY_ADDRESS"],
        corPrimaria: process.env["BOOTSTRAP_COMPANY_PRIMARY_COLOR"] ?? "#0D2B45",
        corSecundaria: process.env["BOOTSTRAP_COMPANY_SECONDARY_COLOR"] ?? "#F5A623",
      },
    },
  ];
}

/**
 * Idempotent bootstrap: ensures the multi-tenant session table and configured
 * admin users exist. Always re-syncs the password hash from environment
 * variables. Logs only emails and outcomes, never passwords.
 */
export async function ensureBootstrapSeed(): Promise<void> {
  try {
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

    for (const u of getBootstrapUsers()) {
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
