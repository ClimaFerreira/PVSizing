import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

function hexToHsl(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16) / 255;
  const g = parseInt(m.substring(2, 4), 16) / 255;
  const b = parseInt(m.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { company } = useAuth();
  useEffect(() => {
    if (!company) return;
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", company.corPrimaria);
    root.style.setProperty("--brand-secondary", company.corSecundaria);
    root.style.setProperty("--primary", hexToHsl(company.corPrimaria));
    root.style.setProperty("--ring", hexToHsl(company.corPrimaria));
  }, [company]);
  return <>{children}</>;
}
