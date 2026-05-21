import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const batteriesTable = pgTable("batteries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  nome: text("nome").notNull(),
  fabricante: text("fabricante").notNull(),
  capacidade: numeric("capacidade", { precision: 10, scale: 2 }).notNull(),
  tensaoNominal: numeric("tensao_nominal", { precision: 10, scale: 2 }).notNull(),
  potenciaCarga: numeric("potencia_carga", { precision: 10, scale: 2 }).notNull(),
  potenciaDescarga: numeric("potencia_descarga", { precision: 10, scale: 2 }).notNull(),
  profundidadeDescarga: numeric("profundidade_descarga", { precision: 5, scale: 2 }).notNull(),
  compatibilidade: text("compatibilidade"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBatterySchema = createInsertSchema(batteriesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertBattery = z.infer<typeof insertBatterySchema>;
export type Battery = typeof batteriesTable.$inferSelect;
