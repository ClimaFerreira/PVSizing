import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: [
  "./src/schema/companies.ts",
  "./src/schema/users.ts",
  "./src/schema/customers.ts",
  "./src/schema/panels.ts",
  "./src/schema/inverters.ts",
  "./src/schema/batteries.ts",
  "./src/schema/projects.ts",
  "./src/schema/systems.ts",
  "./src/schema/proposals.ts",
  "./src/schema/conversations.ts",
  "./src/schema/messages.ts",
  "./src/schema/wizard-drafts.ts",
],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
