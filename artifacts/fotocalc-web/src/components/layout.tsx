import { Link, useLocation } from "wouter";
import logoSrc from "@/logo.png";
import { Calculator, Map as MapIcon, LineChart, FileText, Sun } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

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
          <img src={logoSrc} alt="FotoCalc Logo" className="h-10 mb-2 brightness-0 invert" />
          <h1 className="text-xl font-bold tracking-tight text-[#F5A623]">FotoCalc</h1>
          <p className="text-xs text-[#8ca3b8]">Precision Engineering Tool</p>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
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
            <a href="/">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors text-[#b4c6d6] hover:bg-[#1a3d5c] hover:text-white">
                <Sun size={18} className="text-[#8ca3b8]" />
                Dimensionamento FV
              </div>
            </a>
          </div>
        </nav>

        <div className="p-4 border-t border-[#1a3d5c] text-xs text-[#8ca3b8] space-y-1 bg-[#0a2238]">
          <div className="font-semibold text-white mb-2">Pinheiro Instalações</div>
          <div>NIF: 506505170</div>
          <div>Tel: 964 119 508</div>
          <div className="truncate" title="Quinta do Chão Grande nº78 Massarocas, 3660-409 São Pedro do Sul">São Pedro do Sul</div>
        </div>
      </aside>

      <main className="flex-1 h-full overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
