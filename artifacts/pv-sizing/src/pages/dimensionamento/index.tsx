import { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Wand2, Ruler, Map } from "lucide-react";
import TabEspacamento from "./tab-espacamento";

const TabMapa = lazy(() => import("./tab-mapa"));
const WizardPage = lazy(() => import("@/pages/wizard"));

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

export default function DimensionamentoPage() {
  const [activeTab, setActiveTab] = useState("dados-fv");

  return (
    <div className="space-y-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#0D2B45] tracking-tight">Dimensionamento FV</h1>
        <p className="text-muted-foreground mt-1">Simulação de consumo, espaçamento de painéis e mapeamento de telhado.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 h-auto p-1 bg-slate-100 rounded-xl w-full sm:w-auto overflow-x-auto flex gap-1">
          <TabsTrigger
            value="dados-fv"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-[#0D2B45] data-[state=active]:shadow-sm whitespace-nowrap"
          >
            <Wand2 size={16} />
            Dados FV
          </TabsTrigger>
          <TabsTrigger
            value="espacamento"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-[#0D2B45] data-[state=active]:shadow-sm whitespace-nowrap"
          >
            <Ruler size={16} />
            Espaçamento / Sombras
          </TabsTrigger>
          <TabsTrigger
            value="mapa"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-[#0D2B45] data-[state=active]:shadow-sm whitespace-nowrap"
          >
            <Map size={16} />
            Mapa Satélite
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados-fv" className="mt-0">
          <Suspense fallback={<LoadingSkeleton />}>
            <WizardPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="espacamento" className="mt-0">
          <TabEspacamento />
        </TabsContent>

        {/* Keep mapa mounted always after first activation to avoid re-init */}
        <TabsContent value="mapa" className="mt-0" forceMount>
          <div className={activeTab === "mapa" ? "block" : "hidden"}>
            <Suspense fallback={<LoadingSkeleton />}>
              <TabMapa isActive={activeTab === "mapa"} />
            </Suspense>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
