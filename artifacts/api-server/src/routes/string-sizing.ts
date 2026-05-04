import { Router, type IRouter } from "express";
import {
  CalculateStringSizingBody,
  CalculateStringSizingResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// String sizing calculation with thermal analysis
router.post("/tools/string-sizing", (req, res): void => {
  const parsed = CalculateStringSizingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    voc,
    vmp,
    isc,
    imp,
    coefTensao,
    coefCorrente,
    noct,
    vmpptMin,
    vmpptMax,
    vdcMax,
    impptMax,
    ipviscMax,
    irradiancia = 1000,
    ganhosBifacial = 0,
  } = parsed.data;

  const betaV = coefTensao / 100; // %/°C → fraction/°C
  const alphaI = coefCorrente / 100;
  const G = irradiancia;
  const bifacial = ganhosBifacial / 100;
  const deltaT = (noct - 20) * (G / 800); // Temperature rise above ambient

  // Minimum panels for start-up at 10°C ambient
  const tAmbStart = 10;
  const tCellStart = tAmbStart + deltaT;
  const vocStart = voc * (1 + betaV * (tCellStart - 25));
  const nStart = vocStart > 0 ? Math.ceil(vmpptMin / vocStart) : 1;

  // Calculate per temperature row
  const temps = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];
  const tabelaTermica: Array<{
    tAmb: number;
    tCelula: number;
    voc: number;
    vmp: number;
    isc: number;
    imp: number;
    nPaineis: number;
    estado: string;
    mensagem: string;
  }> = [];

  let nMaxGlobal = 0;
  let nRecomendado = 0;
  const erros: string[] = [];
  const avisos: string[] = [];

  for (const tAmb of temps) {
    const tCell = tAmb + deltaT;
    const vocT = voc * (1 + betaV * (tCell - 25));
    const vmpT = vmp * (1 + betaV * (tCell - 25));
    const iscT = isc * (1 + alphaI * (tCell - 25)) * (1 + bifacial);
    const impT = imp * (1 + alphaI * (tCell - 25)) * (1 + bifacial);

    if (vocT <= 0) continue;

    // Max panels to stay within MPPT range
    const nByMppt = Math.floor(vmpptMax / vocT);
    // Max panels to not exceed DC max
    const nByDcMax = vdcMax > 0 ? Math.floor(vdcMax / vocT) : nByMppt;
    const nPaineis = Math.min(nByMppt, nByDcMax);

    if (nPaineis <= 0) continue;

    const vStringOc = vocT * nPaineis;
    const vStringMpp = vmpT * nPaineis;

    let estado: string = "OK";
    let mensagem = "Dentro dos limites";

    // Check DC max (safety critical)
    if (vdcMax > 0 && vStringOc > vdcMax) {
      estado = "ERRO_TENSAO";
      mensagem = `Voc (${vStringOc.toFixed(0)}V) excede Vdc máx (${vdcMax}V)`;
      if (!erros.includes(mensagem)) erros.push(mensagem);
    }
    // Check PVIsc limit
    else if (ipviscMax > 0 && iscT > ipviscMax) {
      estado = "ERRO_CORRENTE";
      mensagem = `Isc (${iscT.toFixed(2)}A) excede limite PVIsc (${ipviscMax}A)`;
      if (!erros.includes(mensagem)) erros.push(mensagem);
    }
    // Check MPPT current (clipping)
    else if (impptMax > 0 && impT > impptMax) {
      estado = "CLIPPING";
      mensagem = `Impp (${impT.toFixed(2)}A) excede corrente MPPT (${impptMax}A) — perda de produção`;
      if (!avisos.includes(mensagem)) avisos.push(`A ${tAmb}°C: ${mensagem}`);
    }
    // Check MPPT voltage range
    else if (vStringMpp < vmpptMin) {
      estado = "CLIPPING";
      mensagem = `Vmpp (${vStringMpp.toFixed(0)}V) abaixo do mínimo MPPT (${vmpptMin}V)`;
    }

    tabelaTermica.push({
      tAmb,
      tCelula: tCell,
      voc: vStringOc,
      vmp: vStringMpp,
      isc: iscT,
      imp: impT,
      nPaineis,
      estado,
      mensagem,
    });

    if (estado === "OK" || estado === "CLIPPING") {
      if (nPaineis > nMaxGlobal) nMaxGlobal = nPaineis;
    }
  }

  // Recommended: max panels at 25°C (standard conditions)
  const row25 = tabelaTermica.find((r) => r.tAmb === 25);
  if (row25) nRecomendado = row25.nPaineis;
  else nRecomendado = nMaxGlobal;

  // Final check: warn if recommended < min for startup
  if (nRecomendado < nStart) {
    avisos.push(`Atenção: o número máximo de painéis por string (${nRecomendado}) pode ser insuficiente para o arranque do inversor (mínimo ${nStart} painéis).`);
  }

  res.json(
    CalculateStringSizingResponse.parse({
      nMinArranque: nStart,
      nMaxString: nMaxGlobal,
      nRecomendado,
      tabelaTermica,
      avisos,
      erros,
    })
  );
});

export default router;
