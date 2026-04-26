import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invertersTable = pgTable("inverters", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  fabricante: text("fabricante").notNull(),
  potenciaAc: numeric("potencia_ac", { precision: 10, scale: 2 }).notNull(),
  potenciaDcMax: numeric("potencia_dc_max", { precision: 10, scale: 2 }).notNull(),
  mpptMin: numeric("mppt_min", { precision: 10, scale: 2 }).notNull(),
  mpptMax: numeric("mppt_max", { precision: 10, scale: 2 }).notNull(),
  corrMaxMppt: numeric("corr_max_mppt", { precision: 10, scale: 4 }).notNull(),
  numMppt: integer("num_mppt").notNull(),
  stringsPorMppt: integer("strings_por_mppt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInverterSchema = createInsertSchema(invertersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertInverter = z.infer<typeof insertInverterSchema>;
export type Inverter = typeof invertersTable.$inferSelect;
