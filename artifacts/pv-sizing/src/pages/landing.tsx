import { Link } from "wouter";
import { Sun, Map as MapIcon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md">
            <Sun size={28} />
          </div>
          <span className="font-bold text-3xl tracking-tight">SolarDim</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Plataforma de Dimensionamento Fotovoltaico
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          Escolha um módulo para começar. Cada ferramenta funciona de forma
          independente — os seus cálculos e dados permanecem inalterados.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        <Card className="hover:shadow-lg transition-shadow flex flex-col">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
              <Sun size={24} />
            </div>
            <CardTitle className="text-xl">Dimensionamento FV</CardTitle>
            <CardDescription>SolarDim</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <p className="text-sm text-muted-foreground mb-6 flex-1">
              Gestão completa de clientes, catálogo de equipamentos (painéis,
              inversores e baterias), cálculo de strings, wizard automático com
              análise PVGIS, estudo financeiro a 25 anos e geração de propostas
              técnicas.
            </p>
            <Link href="/painel">
              <Button className="w-full" data-testid="button-open-solardim">
                Abrir
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow flex flex-col">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
              <MapIcon size={24} />
            </div>
            <CardTitle className="text-xl">Layout / Mapa</CardTitle>
            <CardDescription>FotoCalc</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <p className="text-sm text-muted-foreground mb-6 flex-1">
              Cálculo de espaçamento entre fileiras e análise de sombras,
              visualização em mapa satélite, estudo de ROI rápido e relatórios
              de instalação. Ideal para a fase de projeto e implantação no
              terreno.
            </p>
            <a href="/fotocalc-web/" data-testid="link-open-fotocalc">
              <Button className="w-full" variant="secondary">
                Abrir
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
