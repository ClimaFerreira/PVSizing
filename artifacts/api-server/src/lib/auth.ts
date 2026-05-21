import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    companyId?: number;
    userEmail?: string;
    userNome?: string;
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const cid = req.session?.companyId;
  const uid = req.session?.userId;
  if (!cid || !uid) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  next();
}

export function getCompanyId(req: Request): number {
  const id = req.session?.companyId;
  if (!id) throw new Error("Sessão sem companyId — middleware requireAuth em falta");
  return id;
}

export function getUserId(req: Request): number {
  const id = req.session?.userId;
  if (!id) throw new Error("Sessão sem userId — middleware requireAuth em falta");
  return id;
}
