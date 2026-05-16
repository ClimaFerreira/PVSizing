import { z } from "zod";
import { logger } from "./logger";

const ConfigSchema = z.object({
  PORT: z.string().min(1, "PORT é obrigatório"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY é obrigatório"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function loadConfig(): AppConfig {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    logger.fatal(`Configuração inválida — variáveis em falta:\n${missing}`);
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
