import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, systemsTable, panelsTable, invertersTable, batteriesTable } from "@workspace/db";
import {
  CheckSystemCompatibilityParams,
  CheckSystemCompatibilityResponse,
} from "@workspace/api-zod";
import { getCompanyId } from "../lib/auth";

const router: IRouter = Router();

// Check system compatibility
router.get("/systems/:id/compatibility", async (req, res): Promise<void> => {
  const cid = getCompanyId(req);
  const params = CheckSystemCompatibilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [system] = await db
    .select()
    .from(systemsTable)
    .where(and(eq(systemsTable.id, params.data.id), eq(systemsTable.companyId, cid)));

  if (!system) {
    res.status(404).json({ error: "Sistema não encontrado" });
    return;
  }

  const [panel] = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.id, system.panelId));

  const [inverter] = await db
    .select()
    .from(invertersTable)
    .where(eq(invertersTable.id, system.inverterId));

  if (!panel || !inverter) {
    res.status(404).json({ error: "Equipamento não encontrado" });
    return;
  }

  const erros: string[] = [];
  const avisos: string[] = [];

  const numPaneis = system.numPaineis;
  const paineisString = system.paineisporstring;
  const numStrings = system.numStrings;

  // String voltage = Vmp * panels per string
  const vmp = Number(panel.vmp);
  const voc = Number(panel.voc);
  const isc = Number(panel.isc);
  const imp = Number(panel.imp);
  const potenciaPainel = Number(panel.potencia);

  const mpptMin = Number(inverter.mpptMin);
  const mpptMax = Number(inverter.mpptMax);
  const corrMaxMppt = Number(inverter.corrMaxMppt);
  const potenciaAc = Number(inverter.potenciaAc);
  const potenciaDcMax = Number(inverter.potenciaDcMax);
  const stringsPorMppt = inverter.stringsPorMppt;

  const stringVoltageVmp = vmp * paineisString;
  const stringVoltageVoc = voc * paineisString;
  const stringCurrent = isc;
  const totalPotenciaDc = (numPaneis * potenciaPainel) / 1000; // kWp
  const dcAcRatio = totalPotenciaDc / (potenciaAc / 1000);

  // Check MPPT voltage range
  if (stringVoltageVmp < mpptMin) {
    erros.push(`Tensão da string em MPP (${stringVoltageVmp.toFixed(1)}V) está abaixo do mínimo MPPT do inversor (${mpptMin}V)`);
  }

  if (stringVoltageVmp > mpptMax) {
    erros.push(`Tensão da string em MPP (${stringVoltageVmp.toFixed(1)}V) excede o máximo MPPT do inversor (${mpptMax}V)`);
  }

  // Check Voc under inverter max voltage (assume max = mpptMax * 1.15 as safety)
  const inverterMaxVoltage = mpptMax * 1.15;
  if (stringVoltageVoc > inverterMaxVoltage) {
    erros.push(`Tensão de circuito aberto da string (${stringVoltageVoc.toFixed(1)}V) excede a tensão máxima do inversor (${inverterMaxVoltage.toFixed(1)}V)`);
  }

  // Check current per MPPT
  if (stringCurrent * numStrings > corrMaxMppt) {
    erros.push(`Corrente total das strings (${(stringCurrent * numStrings).toFixed(2)}A) excede a corrente máxima MPPT (${corrMaxMppt}A)`);
  }

  // Check DC power under inverter DC max
  if (totalPotenciaDc > potenciaDcMax / 1000) {
    erros.push(`Potência DC total (${totalPotenciaDc.toFixed(2)} kWp) excede a potência DC máxima do inversor (${(potenciaDcMax / 1000).toFixed(2)} kWp)`);
  }

  // DC/AC ratio check
  if (dcAcRatio > 1.5) {
    avisos.push(`Rácio DC/AC (${dcAcRatio.toFixed(2)}) está acima do recomendado (1.5). Pode causar corte de produção.`);
  } else if (dcAcRatio < 0.7) {
    avisos.push(`Rácio DC/AC (${dcAcRatio.toFixed(2)}) está abaixo do recomendado (0.7). O inversor pode ser subdimensionado.`);
  }

  // Battery check if present
  if (system.batteryId) {
    const [battery] = await db
      .select()
      .from(batteriesTable)
      .where(eq(batteriesTable.id, system.batteryId));

    if (!battery) {
      avisos.push("Bateria selecionada não encontrada na base de dados.");
    } else {
      // Basic compatibility: battery nominal voltage vs inverter
      const tensaoNominal = Number(battery.tensaoNominal);
      if (tensaoNominal > mpptMax) {
        erros.push(`Tensão nominal da bateria (${tensaoNominal}V) é incompatível com o intervalo MPPT do inversor.`);
      }

      if (battery.compatibilidade) {
        const compatStr = battery.compatibilidade.toLowerCase();
        const inverterNome = inverter.nome.toLowerCase();
        if (!compatStr.includes(inverterNome) && !compatStr.includes("universal")) {
          avisos.push(`A bateria pode não ser compatível com o inversor selecionado. Verifique a especificação do fabricante.`);
        }
      }
    }
  }

  const estado = erros.length === 0 ? "Válido" : "Inválido";

  res.json(
    CheckSystemCompatibilityResponse.parse({ estado, erros, avisos })
  );
});

export default router;
