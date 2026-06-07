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
  tecnologia: text("tecnologia").notNull().default("LiFePO4"),
  potenciaCarga: numeric("potencia_carga", { precision: 10, scale: 2 }).notNull().default("0"),
  potenciaDescarga: numeric("potencia_descarga", { precision: 10, scale: 2 }).notNull().default("0"),
  profundidadeDescarga: numeric("profundidade_descarga", { precision: 5, scale: 2 }).notNull().default("80"),
  eficienciaRoundTrip: numeric("eficiencia_round_trip", { precision: 5, scale: 2 }),
  ciclosVida: integer("ciclos_vida"),
  correnteCargaMax: numeric("corrente_carga_max", { precision: 10, scale: 2 }),
  correnteDescargaMax: numeric("corrente_descarga_max", { precision: 10, scale: 2 }),
  capacidadeUtil: numeric("capacidade_util", { precision: 10, scale: 2 }),
  garantiaAnos: integer("garantia_anos"),
  compatibilidade: text("compatibilidade"),
  observacoesTecnicas: text("observacoes_tecnicas"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBatterySchema = createInsertSchema(batteriesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertBattery = z.infer<typeof insertBatterySchema>;
export type Battery = typeof batteriesTable.$inferSelect;
