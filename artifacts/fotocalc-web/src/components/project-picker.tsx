import { useState } from "react";
import {
  useListProjects,
  useCreateProject,
  useUpdateProject,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import type { Project } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/contexts/ClientContext";
import { usePanelCtx } from "@/contexts/PanelContext";
import { useSolar } from "@/contexts/SolarContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FolderKanban, Save, Plus, Loader2 } from "lucide-react";

const NONE = "__none__";

export function ProjectPicker() {
  const { data: projects, isLoading } = useListProjects();
  const create = useCreateProject();
  const update = useUpdateProject();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { client, setClient } = useClient();
  const { panel, setPanel } = usePanelCtx();
  const { params, setParams } = useSolar();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const selected = projects?.find((p) => p.id === selectedId) ?? null;

  const onLoad = (idStr: string) => {
    if (idStr === NONE) {
      setSelectedId(null);
      return;
    }
    const id = Number(idStr);
    const p = projects?.find((x) => x.id === id);
    if (!p) return;
    setSelectedId(id);

    // Apply project data into FotoCalc contexts (no logic changes,
    // only string updates to existing context state)
    if (p.morada) setClient((c) => ({ ...c, address: p.morada ?? c.address }));

    // IMPORTANT: route `angle` (inclination) through setParams — SolarContext's
    // setParams owns the panel→solar sync; calling setPanel for inclination
    // and then setParams separately would overwrite it with stale closure state.
    setParams((prev) => ({
      ...prev,
      angle: p.inclinacao != null ? String(p.inclinacao) : prev.angle,
      rows: p.layoutRows != null ? String(p.layoutRows) : prev.rows,
      cols: p.layoutCols != null ? String(p.layoutCols) : prev.cols,
      mountType: p.mountType ?? prev.mountType,
    }));

    // azimuth + orientation live only in PanelContext; setParams doesn't touch them.
    setPanel((prev) => ({
      ...prev,
      azimuth: p.azimute != null ? String(p.azimute) : prev.azimuth,
      orientation: p.orientacao ?? prev.orientation,
    }));

    toast({ title: "Estudo carregado", description: p.nome });
  };

  const buildPayload = (nome: string) => {
    const rows = parseInt(params.rows) || 0;
    const cols = parseInt(params.cols) || 0;
    const numPaineis = rows * cols;
    const panelW = parseFloat(panel.panelPower) || 0;
    const potenciaKwp = (numPaineis * panelW) / 1000;
    return {
      nome,
      morada: client.address || null,
      numPaineis: numPaineis || null,
      potenciaKwp: potenciaKwp || null,
      inclinacao: parseFloat(panel.inclination) || null,
      azimute: parseFloat(panel.azimuth) || null,
      orientacao: panel.orientation || null,
      layoutRows: rows || null,
      layoutCols: cols || null,
      mountType: params.mountType || null,
    };
  };

  const onSaveNew = () => {
    if (!newName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    create.mutate(
      { data: buildPayload(newName.trim()) },
      {
        onSuccess: (created: Project) => {
          qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setSelectedId(created.id);
          setSaveOpen(false);
          setNewName("");
          toast({ title: "Estudo guardado", description: created.nome });
        },
        onError: (e) => toast({ title: "Erro ao guardar", description: String(e), variant: "destructive" }),
      },
    );
  };

  const onUpdate = () => {
    if (!selected) return;
    update.mutate(
      { id: selected.id, data: buildPayload(selected.nome) },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Estudo atualizado" });
        },
        onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
      },
    );
  };

  return (
    <Card className="border-[#1a3d5c]/10 shadow-sm">
      <CardContent className="p-3 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex items-center gap-2 text-[#0D2B45] font-medium text-sm shrink-0">
          <FolderKanban size={18} className="text-[#F5A623]" />
          Estudo / Projeto
        </div>
        <div className="flex-1 min-w-0">
          <Select
            value={selectedId != null ? String(selectedId) : NONE}
            onValueChange={onLoad}
            disabled={isLoading}
          >
            <SelectTrigger data-testid="select-project">
              <SelectValue placeholder={isLoading ? "A carregar…" : "Carregar estudo existente"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Nenhum (parâmetros locais) —</SelectItem>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.nome}
                  {p.potenciaKwp != null ? ` · ${p.potenciaKwp.toFixed(2)} kWp` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 shrink-0">
          {selected && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUpdate}
              disabled={update.isPending}
              data-testid="button-update-project"
            >
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Atualizar
            </Button>
          )}
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-save-project">
                <Plus className="h-4 w-4 mr-1" /> Guardar como…
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Guardar como novo estudo</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  autoFocus
                  placeholder="Nome do estudo"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="input-new-project-name"
                />
                <p className="text-xs text-muted-foreground">
                  Vão ser guardados: morada, nº painéis ({(parseInt(params.rows) || 0) * (parseInt(params.cols) || 0)}),
                  potência, inclinação, orientação e layout atuais.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
                <Button onClick={onSaveNew} disabled={create.isPending}>
                  {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
