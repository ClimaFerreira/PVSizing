import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invertersTable = pgTable("inverters", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  nome: text("nome").notNull(),
  fabricante: text("fabricante").notNull(),
  potenciaAc: numeric("potencia_ac", { precision: 10, scale: 2 }).notNull(),
  potenciaDcMax: numeric("potencia_dc_max", { precision: 10, scale: 2 }).notNull(),
  mpptMin: numeric("mppt_min", { precision: 10, scale: 2 }).notNull(),
  mpptMax: numeric("mppt_max", { precision: 10, scale: 2 }).notNull(),
  corrMaxMppt: numeric("corr_max_mppt", { precision: 10, scale: 4 }).notNull(),
  numMppt: integer("num_mppt").notNull(),
  stringsPorMppt: integer("strings_por_mppt").notNull(),
  vdcMax: numeric("vdc_max", { precision: 8, scale: 2 }),
  tipoRede: text("tipo_rede"),
  tensaoAcNominal: text("tensao_ac_nominal"),
  faixaTensaoAc: text("faixa_tensao_ac"),
  ligacaoRede: text("ligacao_rede"),
  frequenciaAc: text("frequencia_ac"),
  potenciaAparenteAc: numeric("potencia_aparente_ac", { precision: 10, scale: 2 }),
  correnteNominalAc: numeric("corrente_nominal_ac", { precision: 10, scale: 2 }),
  correnteMaxAc: numeric("corrente_max_ac", { precision: 10, scale: 2 }),
  fatorPotencia: text("fator_potencia"),
  thdi: text("thdi"),
  correnteInjecaoDc: text("corrente_injecao_dc"),
  potenciaPvMax: numeric("potencia_pv_max", { precision: 10, scale: 2 }),
  potenciaDcNominal: numeric("potencia_dc_nominal", { precision: 10, scale: 2 }),
  tensaoArranque: numeric("tensao_arranque", { precision: 10, scale: 2 }),
  tensaoNominalDc: text("tensao_nominal_dc"),
  correnteCurtoCircuitoMppt: numeric("corrente_curto_circuito_mppt", { precision: 10, scale: 4 }),
  bateriaTensaoRange: text("bateria_tensao_range"),
  bateriaCorrenteCargaMax: numeric("bateria_corrente_carga_max", { precision: 10, scale: 2 }),
  bateriaCorrenteDescargaMax: numeric("bateria_corrente_descarga_max", { precision: 10, scale: 2 }),
  bateriaPotenciaCargaMax: numeric("bateria_potencia_carga_max", { precision: 10, scale: 2 }),
  bateriaPotenciaDescargaMax: numeric("bateria_potencia_descarga_max", { precision: 10, scale: 2 }),
  grauProtecao: text("grau_protecao"),
  comunicacao: text("comunicacao"),
  observacoesTecnicas: text("observacoes_tecnicas"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInverterSchema = createInsertSchema(invertersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertInverter = z.infer<typeof insertInverterSchema>;
export type Inverter = typeof invertersTable.$inferSelect;
