import { useClient } from "@/contexts/ClientContext";
import { useSolar } from "@/contexts/SolarContext";
import { useRoi } from "@/contexts/RoiContext";
import { useMapa } from "@/contexts/MapaContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import logoSrc from "@/logo.png";
import { buildCrossSectionSvg, buildLayoutSvg, buildCoplanarLayoutSvg, buildMonthlyBarChartSvg, buildRoiLineChartSvg } from "@/lib/svg-utils";

export default function ReportPage() {
  const { client, setClient } = useClient();
  const { params: solarParams, results: solarResults } = useSolar();
  const { params: roiParams, results: roiResults } = useRoi();
  const { mapData } = useMapa();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClient(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const formatEur = (val: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(val);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório FotoCalc - ${client.name || 'Cliente'}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; color: #0D2B45; line-height: 1.5; margin: 0; padding: 40px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0D2B45; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { height: 50px; }
          .company-details { text-align: right; font-size: 12px; color: #64748B; }
          .title { font-size: 24px; font-weight: 700; color: #0D2B45; margin: 0; }
          .section { margin-bottom: 40px; page-break-inside: avoid; }
          .section-title { font-size: 18px; font-weight: 600; color: #1E88E5; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px; margin-bottom: 16px; }
          
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
          
          .box { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 15px; border-radius: 8px; }
          .box-label { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          .box-value { font-size: 18px; font-weight: 600; color: #0D2B45; }
          .box-value.highlight { color: #1E88E5; }
          .box-value.warning { color: #EF4444; }
          .box-value.success { color: #10B981; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #E2E8F0; }
          th { background: #F1F5F9; color: #64748B; font-weight: 600; }
          
          .svg-container { text-align: center; margin: 20px 0; background: #fff; border: 1px solid #E2E8F0; padding: 15px; border-radius: 8px; }
          .svg-container svg { max-width: 100%; height: auto; }
          
          @media print {
            body { padding: 0; }
            @page { margin: 1.5cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <img src="${window.location.origin}${logoSrc}" class="logo" alt="Logo" />
            <h1 class="title">Estudo Fotovoltaico</h1>
            <div style="font-size: 14px; color: #64748B; margin-top: 5px;">Data: ${new Date().toLocaleDateString('pt-PT')}</div>
          </div>
          <div class="company-details">
            <strong>Pinheiro Instalações Eléctricas e Canalizações Unipessoal Lda</strong><br>
            NIF: 506505170 | Tel: 964 119 508<br>
            Quinta do Chão Grande nº78 Massarocas<br>
            3660-409 São Pedro do Sul
          </div>
        </div>

        ${client.name ? `
        <div class="section">
          <div class="section-title">Dados do Cliente</div>
          <div class="grid-2">
            <div>
              <strong>Nome:</strong> ${client.name}<br>
              <strong>Morada:</strong> ${client.address || '-'}<br>
            </div>
            <div>
              <strong>NIF:</strong> ${client.nif || '-'}<br>
              <strong>Contacto:</strong> ${client.phone || '-'} / ${client.email || '-'}
            </div>
          </div>
        </div>
        ` : ''}

        ${mapData ? `
        <div class="section">
          <div class="section-title">Análise de Cobertura — Mapa Satélite</div>
          ${mapData.mapImageDataUrl ? `
          <div style="text-align:center; margin-bottom:20px;">
            <img src="${mapData.mapImageDataUrl}" style="max-width:100%; max-height:420px; border-radius:10px; border:1px solid #E2E8F0; object-fit:cover;" alt="Mapa satélite com painéis" />
            <div style="font-size:11px;color:#94A3B8;margin-top:6px;">Vista satélite com disposição dos painéis</div>
          </div>` : ''}
          <div class="grid-4 mb-4">
            <div class="box">
              <div class="box-label">Módulos</div>
              <div class="box-value highlight">${mapData.panelCount} un</div>
            </div>
            <div class="box">
              <div class="box-label">Potência</div>
              <div class="box-value">${mapData.totalKwp?.toFixed(2)} kWp</div>
            </div>
            <div class="box">
              <div class="box-label">Área Útil</div>
              <div class="box-value">${mapData.roofArea} m²</div>
            </div>
            <div class="box">
              <div class="box-label">Tipo</div>
              <div class="box-value" style="font-size:14px;">${mapData.mountType === 'coplanar' ? 'Coplanar' : 'Triângulos'}</div>
            </div>
          </div>
          <div class="grid-4">
            <div class="box" style="grid-column:span 2">
              <div class="box-label">Orientação</div>
              <div class="box-value">${mapData.orientationLabel}</div>
            </div>
            <div class="box" style="grid-column:span 2">
              <div class="box-label">Azimute</div>
              <div class="box-value">${mapData.azimuth}°</div>
            </div>
          </div>
          ${mapData.panelSvg && !mapData.mapImageDataUrl ? `<div class="svg-container" style="max-width: 500px; margin: 20px auto 0;">${mapData.panelSvg}</div>` : ''}
        </div>
        ` : ''}

        ${solarParams.mountType === 'coplanar' ? `
        <div class="section">
          <div class="section-title">Disposição dos Painéis — Telhado Coplanar</div>
          <div class="grid-4" style="margin-bottom: 20px;">
            <div class="box">
              <div class="box-label">Fileiras × Colunas</div>
              <div class="box-value highlight">${solarParams.rows} × ${solarParams.cols}</div>
            </div>
            <div class="box">
              <div class="box-label">Total Painéis</div>
              <div class="box-value">${(parseInt(solarParams.rows)||0) * (parseInt(solarParams.cols)||0)} un</div>
            </div>
            <div class="box">
              <div class="box-label">Alt. Painel</div>
              <div class="box-value">${solarResults.panelHeight.toFixed(2)} m</div>
            </div>
            <div class="box">
              <div class="box-label">Larg. Painel</div>
              <div class="box-value">${solarResults.panelWidth.toFixed(2)} m</div>
            </div>
          </div>
          <div class="svg-container" style="max-width: 400px; margin: 0 auto;">${buildCoplanarLayoutSvg(solarResults.panelHeight, solarResults.panelWidth, parseInt(solarParams.rows)||1, parseInt(solarParams.cols)||1)}</div>
        </div>
        ` : `
        <div class="section">
          <div class="section-title">Estudo de Sombreamento e Espaçamento — Estrutura Triângulos</div>
          <div class="grid-4" style="margin-bottom: 20px;">
            <div class="box">
              <div class="box-label">Distância Início-Início</div>
              <div class="box-value highlight">${solarResults.rowSpacing.toFixed(2)} m</div>
            </div>
            <div class="box">
              <div class="box-label">Espaço Livre (Gap)</div>
              <div class="box-value ${solarResults.gap < 0.5 ? 'warning' : ''}">${solarResults.gap.toFixed(2)} m</div>
            </div>
            <div class="box">
              <div class="box-label">Área Ocupada N-S</div>
              <div class="box-value">${solarResults.totalLength.toFixed(2)} m</div>
            </div>
            <div class="box">
              <div class="box-label">Área Ocupada E-O</div>
              <div class="box-value">${solarResults.totalWidth.toFixed(2)} m</div>
            </div>
          </div>
          <div class="svg-container">${buildCrossSectionSvg(solarResults)}</div>
          <div class="svg-container" style="max-width: 400px; margin: 0 auto;">${buildLayoutSvg(solarResults, parseInt(solarParams.rows)||1, parseInt(solarParams.cols)||1)}</div>
        </div>
        `}

        ${roiResults ? `
        <div class="section" style="page-break-before: always;">
          <div class="section-title">Análise Financeira e Retorno (ROI)</div>
          
          <div class="grid-4" style="margin-bottom: 20px;">
            <div class="box">
              <div class="box-label">Poupança Anual</div>
              <div class="box-value success">${formatEur(roiResults.annualSavingsEur)}</div>
            </div>
            <div class="box">
              <div class="box-label">Payback</div>
              <div class="box-value">${roiResults.paybackYears === Infinity ? '>25' : roiResults.paybackYears.toFixed(1)} anos</div>
            </div>
            <div class="box">
              <div class="box-label">Produção Anual</div>
              <div class="box-value">${Math.round(roiResults.annualProductionKwh)} kWh</div>
            </div>
            <div class="box">
              <div class="box-label">Lucro a 25 anos</div>
              <div class="box-value success">${formatEur(roiResults.netAfter25)}</div>
            </div>
          </div>

          <table>
            <tr><th>Parâmetro</th><th>Valor</th><th>Parâmetro</th><th>Valor</th></tr>
            <tr>
              <td>Investimento Inicial</td><td>${formatEur(parseFloat(roiParams.investmentCost) || 0)}</td>
              <td>Autoconsumo</td><td>${Math.round(roiResults.selfKwh)} kWh (${Math.round(roiResults.selfRate*100)}%)</td>
            </tr>
            <tr>
              <td>Preço Energia (Compra)</td><td>${roiParams.electricityPrice} €/kWh</td>
              <td>Injeção na Rede</td><td>${Math.round(roiResults.exportKwh)} kWh</td>
            </tr>
            <tr>
              <td>Tarifa de Venda</td><td>${roiParams.feedInTariff} €/kWh</td>
              <td>Com Baterias?</td><td>${roiParams.hasBattery ? 'Sim ('+roiParams.batteryCapacity+' kWh)' : 'Não'}</td>
            </tr>
          </table>

          <div style="font-weight: 600; margin-bottom: 10px; font-size: 14px; color: #0D2B45;">Produção Mensal Estimada</div>
          <div class="svg-container">${buildMonthlyBarChartSvg(roiResults.monthlyKwh)}</div>

          <div style="font-weight: 600; margin-bottom: 10px; font-size: 14px; color: #0D2B45; margin-top: 30px;">Evolução Financeira Acumulada (25 Anos)</div>
          <div class="svg-container">${buildRoiLineChartSvg(roiResults.cumulativeNet)}</div>
        </div>
        ` : ''}

        <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 20px;">
          Este relatório é uma simulação técnica baseada nos parâmetros inseridos. Os valores reais podem divergir consoante as condições meteorológicas e variações de consumo.
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    
    // Wait for SVGs and fonts to render
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex flex-col mb-4">
        <h1 className="text-3xl font-bold text-[#0D2B45] tracking-tight">Relatório Final</h1>
        <p className="text-muted-foreground">Preencha os dados do cliente e gere o PDF do estudo.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-[#1a3d5c]/10 shadow-md">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg text-[#0D2B45]">Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome / Empresa *</Label>
                <Input id="name" name="name" value={client.name} onChange={handleChange} placeholder="Ex: João Silva" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Morada</Label>
                <Input id="address" name="address" value={client.address} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nif">NIF</Label>
                <Input id="nif" name="nif" value={client.nif} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input type="email" id="email" name="email" value={client.email} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input type="tel" id="phone" name="phone" value={client.phone} onChange={handleChange} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#F0F6FB] border-[#1E88E5]/20">
            <CardContent className="pt-6 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Calculadora de Espaçamento</span>
                {solarResults ? <span className="text-[#10B981] font-semibold">Pronto</span> : <span className="text-[#EF4444]">Pendente</span>}
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Mapeamento Satélite</span>
                {mapData ? <span className="text-[#10B981] font-semibold">Pronto</span> : <span className="text-[#F5A623]">Pendente</span>}
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Estudo ROI</span>
                {roiResults ? <span className="text-[#10B981] font-semibold">Pronto</span> : <span className="text-[#F5A623]">Pendente</span>}
              </div>
            </CardContent>
          </Card>

          <Button 
            onClick={handlePrint} 
            disabled={!client.name}
            className="w-full bg-[#1E88E5] hover:bg-[#186aab] text-white font-bold h-12 text-lg"
          >
            <Printer className="mr-2" size={20} />
            Gerar PDF
          </Button>
          {!client.name && <p className="text-xs text-center text-muted-foreground">Insira o nome do cliente para gerar o relatório</p>}
        </div>

        <div className="lg:col-span-8 bg-white border rounded-xl shadow-inner p-8 overflow-y-auto max-h-[800px] grayscale-[0.2] opacity-80 pointer-events-none select-none">
           {/* Visual mock of the report to fill space, the real one opens in new tab */}
           <div className="max-w-2xl mx-auto space-y-8">
             <div className="flex justify-between border-b pb-4">
                <div>
                  <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
                  <div className="h-6 w-48 bg-slate-200 rounded mt-4 animate-pulse" />
                </div>
                <div className="space-y-2 text-right">
                  <div className="h-4 w-32 bg-slate-200 rounded ml-auto animate-pulse" />
                  <div className="h-4 w-40 bg-slate-200 rounded ml-auto animate-pulse" />
                </div>
             </div>
             
             <div className="space-y-4">
                <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-20 bg-slate-100 rounded border animate-pulse" />
                  <div className="h-20 bg-slate-100 rounded border animate-pulse" />
                </div>
             </div>

             <div className="space-y-4">
                <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
                <div className="grid grid-cols-4 gap-4">
                  <div className="h-24 bg-slate-100 rounded border animate-pulse" />
                  <div className="h-24 bg-slate-100 rounded border animate-pulse" />
                  <div className="h-24 bg-slate-100 rounded border animate-pulse" />
                  <div className="h-24 bg-slate-100 rounded border animate-pulse" />
                </div>
                <div className="h-64 w-full bg-slate-100 rounded border animate-pulse" />
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
