import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";

export default function LoginPage() {
  const { login, user } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) { navigate("/calculator"); return null; }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(email.trim(), password);
      navigate("/calculator");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar sessão");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-background to-sky-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-lg bg-[#0D2B45] flex items-center justify-center text-[#F5A623] mb-3">
            <Calculator size={28} />
          </div>
          <CardTitle className="text-2xl">FotoCalc</CardTitle>
          <p className="text-sm text-muted-foreground">Precision Engineering Tool</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email}
                onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Palavra-passe</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "A entrar…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
