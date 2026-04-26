import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  morada: text("morada").notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 6 }).notNull(),
  tipoCliente: text("tipo_cliente").notNull(),
  precoEletricidade: numeric("preco_eletricidade", { precision: 10, scale: 4 }).notNull(),
  potenciaContratada: numeric("potencia_contratada", { precision: 10, scale: 2 }).notNull(),
  perfilConsumo: text("perfil_consumo").notNull(),
  consumoMensal: numeric("consumo_mensal", { precision: 12, scale: 2 }),
  consumoAnual: numeric("consumo_anual", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
