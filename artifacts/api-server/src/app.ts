import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Structured request logging ────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    customLogLevel(_req: IncomingMessage, res: ServerResponse, err: Error | undefined) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req(req: IncomingMessage & { id?: unknown }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
    customSuccessMessage(req: IncomingMessage, res: ServerResponse) {
      const time = (res as Response & { responseTime?: number }).responseTime;
      if (time && time > 3000) {
        return `SLOW ${req.method} ${req.url?.split("?")[0]} (${time}ms)`;
      }
      return `${req.method} ${req.url?.split("?")[0]}`;
    },
  }),
);

// ── Core middleware ────────────────────────────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Global error handler ──────────────────────────────────────────────────────
// Must be last — Express identifies error middleware by 4-arg signature.
// Express 5 forwards async errors automatically.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Multer file size / type errors
  if ((err as NodeJS.ErrnoException).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Ficheiro demasiado grande. Limite: 10 MB." });
    return;
  }

  const status =
    (err as { status?: number }).status ??
    (err as { statusCode?: number }).statusCode ??
    500;

  req.log?.error({ err, status }, "Unhandled request error");

  if (res.headersSent) return;

  res.status(status).json({
    error:
      process.env["NODE_ENV"] === "production" && status >= 500
        ? "Erro interno do servidor. Por favor tente mais tarde."
        : (err.message ?? "Erro interno"),
  });
});

export default app;
