import { Link, useLocation } from "wouter";
import { 
  Sun, 
  Users, 
  Battery, 
  Zap, 
  BoxSelect, 
  LayoutDashboard,
  Menu,
  GitBranch,
  Wand2,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Painel Principal", icon: LayoutDashboard },
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/sistemas", label: "Sistemas PV", icon: Sun },
    { href: "/equipamentos/paineis", label: "Painéis Solares", icon: BoxSelect },
    { href: "/equipamentos/inversores", label: "Inversores", icon: Zap },
    { href: "/equipamentos/baterias", label: "Baterias", icon: Battery },
    { href: "/calculadora-strings", label: "Calculadora Strings", icon: GitBranch },
    { href: "/wizard", label: "Wizard Dimensionamento", icon: Wand2 },
    { href: "/propostas", label: "Propostas Técnicas", icon: FileText },
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
          <Sun size={20} />
        </div>
        <span className="font-bold text-xl tracking-tight">SolarDim</span>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer text-sm font-medium",
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon size={18} className={cn(isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-foreground/50 text-center">
        SolarDim v1.0.0
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 z-50 border-r border-sidebar-border shadow-xl">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar & Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4 z-40">
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r-sidebar-border bg-sidebar">
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 ml-4">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground">
            <Sun size={14} />
          </div>
          <span className="font-bold text-sidebar-foreground">SolarDim</span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:pl-64 pt-14 md:pt-0 min-w-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
