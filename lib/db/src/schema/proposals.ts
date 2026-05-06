import { pgTable, serial, text, numeric, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const proposalsTable = pgTable("proposals", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  systemId: integer("system_id"),
  titulo: text("titulo").notNull(),
  consumoAnualEstimado: numeric("consumo_anual_estimado", { precision: 10, scale: 2 }),
  potenciaRecomendada: numeric("potencia_recomendada", { precision: 10, scale: 3 }),
  numPaineis: integer("num_paineis"),
  panelId: integer("panel_id"),
  inverterId: integer("inverter_id"),
  batteryId: integer("battery_id"),
  configuracaoStrings: jsonb("configuracao_strings"),
  producaoAnualEstimada: numeric("producao_anual_estimada", { precision: 10, scale: 2 }),
  payback: numeric("payback", { precision: 5, scale: 2 }),
  tir: numeric("tir", { precision: 5, scale: 2 }),
  alertas: text("alertas").array(),
  status: text("status").notNull().default("rascunho"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Proposal = typeof proposalsTable.$inferSelect;

export const invoiceUploadsTable = pgTable("invoice_uploads", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  filename: text("filename").notNull(),
  rawText: text("raw_text"),
  extractedData: jsonb("extracted_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InvoiceUpload = typeof invoiceUploadsTable.$inferSelect;
