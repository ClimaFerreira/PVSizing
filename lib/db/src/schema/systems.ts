import { pgTable, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemsTable = pgTable("pv_systems", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  panelId: integer("panel_id").notNull(),
  inverterId: integer("inverter_id").notNull(),
  batteryId: integer("battery_id"),
  numPaineis: integer("num_paineis").notNull(),
  paineisporstring: integer("paineis_por_string").notNull(),
  numStrings: integer("num_strings").notNull(),
  inclinacao: numeric("inclinacao", { precision: 6, scale: 2 }).notNull(),
  azimute: numeric("azimute", { precision: 7, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSystemSchema = createInsertSchema(systemsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSystem = z.infer<typeof insertSystemSchema>;
export type PvSystem = typeof systemsTable.$inferSelect;
