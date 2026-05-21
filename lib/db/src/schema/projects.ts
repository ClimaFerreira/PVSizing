import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { panelsTable } from "./panels";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  nome: text("nome").notNull(),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  morada: text("morada"),
  panelId: integer("panel_id").references(() => panelsTable.id, { onDelete: "set null" }),
  numPaineis: integer("num_paineis"),
  potenciaKwp: numeric("potencia_kwp", { precision: 10, scale: 3 }),
  inclinacao: numeric("inclinacao", { precision: 6, scale: 2 }),
  azimute: numeric("azimute", { precision: 7, scale: 2 }),
  orientacao: text("orientacao"),
  layoutRows: integer("layout_rows"),
  layoutCols: integer("layout_cols"),
  mountType: text("mount_type"),
  notas: text("notas"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
