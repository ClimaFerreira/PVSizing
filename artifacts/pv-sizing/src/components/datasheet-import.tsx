import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, FileText, Sparkles } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type TipoEquipamento = "painel" | "inversor" | "bateria";

interface DatasheetResult {
  tipoEquipamento: TipoEquipamento;
  dados: Record<string, unknown>;
  confianca: number;
  notas?: string | null;
}

interface Props {
  tipoEquipamento: TipoEquipamento;
  onExtracted: (dados: Record<string, unknown>) => void;
}

export function DatasheetImport({ tipoEquipamento, onExtracted }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<DatasheetResult | null>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    setIsLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipoEquipamento", tipoEquipamento);
      const resp = await fetch(`${BASE}/api/tools/import-datasheet`, { method: "POST", body: fd });
      if (!resp.ok) throw new Error(await resp.text());
      const result: DatasheetResult = await resp.json();
      setLastResult(result);
      onExtracted(result.dados);
      toast({
        title: `Ficha técnica extraída (confiança: ${(result.confianca * 100).toFixed(0)}%)`,
        description: result.notas ?? "Dados pré-preenchidos no formulário abaixo.",
      });
    } catch {
      toast({ title: "Erro ao processar ficha técnica", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="border-2 border-dashed border-primary/30 rounded-lg p-4 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors mb-4"
      onClick={() => fileInputRef.current?.click()}
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-sm">A extrair dados com IA...</span>
        </div>
      ) : lastResult ? (
        <div className="flex items-center justify-center gap-2 text-green-600">
          <Sparkles size={18} />
          <span className="text-sm font-medium">Ficha extraída</span>
          <Badge variant="secondary">{(lastResult.confianca * 100).toFixed(0)}% confiança</Badge>
          <span className="text-xs text-muted-foreground ml-1">(clique para nova)</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Sparkles size={18} className="text-primary" />
          <span className="text-sm">Importar ficha técnica com IA (PDF/imagem)</span>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}
