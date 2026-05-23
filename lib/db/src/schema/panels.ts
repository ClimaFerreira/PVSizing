import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const panelsTable = pgTable("solar_panels", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  nome: text("nome").notNull(),
  fabricante: text("fabricante").notNull(),
  potencia: numeric("potencia", { precision: 10, scale: 2 }).notNull(),
  voc: numeric("voc", { precision: 10, scale: 4 }).notNull(),
  vmp: numeric("vmp", { precision: 10, scale: 4 }).notNull(),
  isc: numeric("isc", { precision: 10, scale: 4 }).notNull(),
  imp: numeric("imp", { precision: 10, scale: 4 }).notNull(),
  coeficienteTemperatura: numeric("coeficiente_temperatura", { precision: 10, scale: 4 }).notNull(),
  coeficienteTemperaturaVoc: numeric("coeficiente_temperatura_voc", { precision: 10, scale: 4 }),
  noct: numeric("noct", { precision: 5, scale: 2 }),
  alturaMm: integer("altura_mm"),
  larguraMm: integer("largura_mm"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPanelSchema = createInsertSchema(panelsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPanel = z.infer<typeof insertPanelSchema>;
export type Panel = typeof panelsTable.$inferSelect;
