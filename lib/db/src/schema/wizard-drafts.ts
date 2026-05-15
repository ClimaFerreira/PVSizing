import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const wizardDraftsTable = pgTable("wizard_drafts", {
  id:        serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  step:      integer("step").notNull().default(1),
  data:      jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WizardDraftRow = typeof wizardDraftsTable.$inferSelect;
