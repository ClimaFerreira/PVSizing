import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  nif: text("nif"),
  morada: text("morada"),
  telefone: text("telefone"),
  email: text("email"),
  website: text("website"),
  iban: text("iban"),
  logoUrl: text("logo_url"),
  corPrimaria: text("cor_primaria").notNull().default("#0D2B45"),
  corSecundaria: text("cor_secundaria").notNull().default("#F5A623"),
  rodapeProposta: text("rodape_proposta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
