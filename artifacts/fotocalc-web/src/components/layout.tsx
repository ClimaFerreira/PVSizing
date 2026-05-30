import { Link, useLocation } from "wouter";
import logoSrc from "@/logo.png";
import { Calculator, Map as MapIcon, LineChart, FileText, Sun, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, company, logout } = useAuth();
  const brandName = company?.nome ?? "FotoCalc";

  const navItems = [
    { href: "/calculator", icon: Calculator, label: "Espaçamento" },
    { href: "/roi", icon: LineChart, label: "Estudo ROI" },
    { href: "/mapa", icon: MapIcon, label: "Mapa Satélite" },
    { href: "/report", icon: FileText, label: "Relatório" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="w-64 bg-[#0D2B45] text-white flex flex-col shrink-0 border-r border-[#1a3d5c]">
        <div className="p-6 border-b border-[#1a3d5c]">
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={brandName} className="h-12 mb-2 object-contain" />
          ) : (
            <img src={logoSrc} alt="FotoCalc Logo" className="h-10 mb-2 brightness-0 invert" />
          )}
          <h1 className="text-xl font-bold tracking-tight text-[#F5A623] truncate" title={brandName}>{brandName}</h1>
          <p className="text-xs text-[#8ca3b8]">Precision Engineering Tool</p>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location === item.href || (location === "/" && item.href === "/calculator");
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                  active ? "bg-[#1E88E5] text-white font-medium" : "text-[#b4c6d6] hover:bg-[#1a3d5c] hover:text-white"
                }`}>
                  <Icon size={18} className={active ? "text-white" : "text-[#8ca3b8]"} />
                  {item.label}
                </div>
              </Link>
            );
          })}
          <div className="pt-3 mt-3 border-t border-[#1a3d5c]">
              <Link href="/dimensionamento">
  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
    location === "/dimensionamento"
      ? "bg-[#1E88E5] text-white font-medium"
      : "text-[#b4c6d6] hover:bg-[#1a3d5c] hover:text-white"
  }`}>
    <Sun size={18} className={location === "/dimensionamento" ? "text-white" : "text-[#8ca3b8]"} />
    Dimensionamento FV
  </div>
</Link>
            <Link href="/empresa">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                location === "/empresa" ? "bg-[#1E88E5] text-white font-medium" : "text-[#b4c6d6] hover:bg-[#1a3d5c] hover:text-white"
              }`}>
                <Settings size={18} className={location === "/empresa" ? "text-white" : "text-[#8ca3b8]"} />
                Definições da Empresa
              </div>
            </Link>
          </div>
        </nav>

        <div className="p-4 border-t border-[#1a3d5c] text-xs text-[#8ca3b8] space-y-1 bg-[#0a2238]">
          <div className="font-semibold text-white mb-1 truncate" title={brandName}>{brandName}</div>
          {company?.nif && <div>NIF: {company.nif}</div>}
          {company?.telefone && <div>Tel: {company.telefone}</div>}
          {company?.morada && <div className="truncate" title={company.morada}>{company.morada}</div>}
          {user && (
            <div className="pt-2 mt-2 border-t border-[#1a3d5c] flex items-center justify-between gap-2">
              <span className="truncate text-[10px]" title={user.email}>{user.nome}</span>
              <button onClick={() => { void logout(); }}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-[#1a3d5c] hover:bg-[#1E88E5] text-white">
                <LogOut size={11} /> Sair
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 h-full overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
