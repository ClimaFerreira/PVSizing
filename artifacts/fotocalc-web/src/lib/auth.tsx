import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";

export interface AuthUser {
  id: number;
  email: string;
  nome: string;
  companyId: number;
  role: string;
}

export interface Company {
  id: number;
  nome: string;
  nif: string | null;
  morada: string | null;
  telefone: string | null;
  email: string | null;
  website: string | null;
  iban: string | null;
  logoUrl: string | null;
  corPrimaria: string;
  corSecundaria: string;
  rodapeProposta: string | null;
}

interface AuthState {
  user: AuthUser | null;
  company: Company | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setCompany: (c: Company) => void;
}

const API = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await apiFetch<{ user: AuthUser; company: Company | null }>("/auth/me");
      setUser(data.user);
      setCompany(data.company);
    } catch {
      setUser(null);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function login(email: string, password: string) {
    await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    await refresh();
  }

  async function logout() {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setUser(null);
    setCompany(null);
    try {
      const root = document.documentElement;
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-secondary");
      root.style.removeProperty("--primary");
    } catch { /* ignore */ }
  }

  return (
    <AuthContext.Provider value={{ user, company, loading, login, logout, refresh, setCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve estar dentro de <AuthProvider>");
  return ctx;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);
  if (loading) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">A carregar…</div>;
  }
  if (!user) return null;
  return <>{children}</>;
}

export async function updateCompany(patch: Partial<Company>): Promise<Company> {
  return apiFetch<Company>("/companies/me", { method: "PUT", body: JSON.stringify(patch) });
}

export { apiFetch };
