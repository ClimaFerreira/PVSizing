import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const LoginBody = z.object({
  email: z.string().min(1).trim(),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email e password obrigatórios" });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  req.session.userId = user.id;
  req.session.companyId = user.companyId;
  req.session.userEmail = user.email;
  req.session.userNome = user.nome;

  req.session.save((err) => {
    if (err) {
      req.log?.error({ err }, "Session save failed");
      res.status(500).json({ error: "Erro ao iniciar sessão" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      nome: user.nome,
      companyId: user.companyId,
      role: user.role,
    });
  });
});

router.post("/auth/logout", (req, res): void => {
  if (!req.session) {
    res.status(204).end();
    return;
  }
  req.session.destroy((err) => {
    if (err) {
      req.log?.error({ err }, "Session destroy failed");
      res.status(500).json({ error: "Erro ao terminar sessão" });
      return;
    }
    res.clearCookie("sd.sid");
    res.status(204).end();
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const uid = req.session?.userId;
  const cid = req.session?.companyId;
  if (!uid || !cid) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user) {
    req.session.destroy(() => {
      res.status(401).json({ error: "Sessão inválida" });
    });
    return;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, cid));
  res.json({
    user: {
      id: user.id,
      email: user.email,
      nome: user.nome,
      companyId: user.companyId,
      role: user.role,
    },
    company: company ?? null,
  });
});

export default router;
