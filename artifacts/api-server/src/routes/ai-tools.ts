import { Router, type IRouter } from "express";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type ImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const VALID_IMAGE_MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function toSafeImageMime(mime: string): ImageMime {
  return VALID_IMAGE_MIMES.includes(mime as ImageMime) ? (mime as ImageMime) : "image/jpeg";
}

function buildFileBlock(isPdf: boolean, mime: string, base64: string) {
  if (isPdf) {
    return { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } };
  }
  return { type: "image" as const, source: { type: "base64" as const, media_type: toSafeImageMime(mime), data: base64 } };
}

// POST /tools/parse-invoice
router.post("/tools/parse-invoice", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Ficheiro é obrigatório" });
    return;
  }

  const { mimetype, buffer } = req.file;
  const isPdf = mimetype === "application/pdf";
  const isImage = mimetype.startsWith("image/");

  if (!isPdf && !isImage) {
    res.status(400).json({ error: "Formato não suportado. Use PDF ou imagem." });
    return;
  }

  try {
    const base64 = buffer.toString("base64");
    const contentBlock = buildFileBlock(isPdf, mimetype, base64);

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Analisa esta fatura de eletricidade portuguesa e extrai os seguintes dados em JSON:
{
  "consumoMensal": número médio mensal em kWh ou null,
  "consumoAnual": consumo total anual em kWh ou null,
  "potenciaContratada": potência contratada em kVA ou null,
  "precoKwh": preço por kWh em EUR ou null,
  "operador": nome da comercializadora ou null,
  "tarifario": nome do tarifário (simples/bi-horária/etc) ou null,
  "periodo": descrição do período da fatura ou null,
  "leituras": array de {mes: string, consumo: número} com leituras mensais se disponíveis,
  "confianca": valor entre 0 e 1 representando confiança na extração,
  "notas": observações relevantes ou null
}
Responde APENAS com o JSON, sem texto adicional.`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "{}";
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const data = JSON.parse(clean);
    res.json(data);
  } catch (err) {
    req.log?.error({ err }, "parse-invoice AI error");
    res.status(502).json({ error: "Erro ao processar fatura com IA" });
  }
});

// POST /tools/auto-size
router.post("/tools/auto-size", async (req, res): Promise<void> => {
  const raw = req.body as Record<string, unknown>;
  const consumoAnualBase = Number(raw.consumoAnual);
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  const inclinacao = raw.inclinacao !== undefined ? Number(raw.inclinacao) : 30;
  const azimute = raw.azimute !== undefined ? Number(raw.azimute) : 0;
  const coberturaMeta = raw.coberturaMeta !== undefined ? Number(raw.coberturaMeta) : 80;
  const incluirBateria = raw.incluirBateria === true || raw.incluirBateria === "true";
  const horasAutonomia = raw.horasAutonomia !== undefined ? Number(raw.horasAutonomia) : 4;
  const crescimentoFuturo = raw.crescimentoFuturo !== undefined ? Number(raw.crescimentoFuturo) : 0;

  if (!consumoAnualBase || !latitude || !longitude) {
    res.status(400).json({ error: "consumoAnual, latitude e longitude são obrigatórios" });
    return;
  }

  // Apply future growth factor
  const consumoAnualAjustado = consumoAnualBase * (1 + crescimentoFuturo / 100);
  const consumoDiario = consumoAnualAjustado / 365;

  // ── Estimate HSP for Portugal ─────────────────────────────────────────────
  // Simple irradiance model: base HSP adjusted for latitude, tilt and azimuth
  const latRad = (Math.abs(latitude) * Math.PI) / 180;
  const baseHsp = 5.2 - latRad * 1.8;
  const tiltFactor = 1 - Math.abs(inclinacao - 35) * 0.005;   // optimal ~35°
  const azimuthFactor = 1 - Math.abs(azimute) * 0.003;        // optimal = South (0°)
  const hsp = Math.max(2.5, baseHsp * tiltFactor * azimuthFactor);

  // ── Sizing formula (as per IEA / industry standard) ───────────────────────
  // Step 1: daily solar energy target
  const energiaAlvoDiaria = consumoDiario * (coberturaMeta / 100);

  // Step 2: brute system size (before losses)  P_bruto = E_dia / HSP
  const potenciaBruta = energiaAlvoDiaria / hsp;

  // Step 3: apply system losses margin (~25%: inverter + temp + wiring + soiling)
  //   P_ajustado = P_bruto / (1 - perdas) = P_bruto / 0.75
  //   We use fatorRendimento = 0.78 (slightly optimistic for PT climate)
  const margemPerdas = 0.22; // 22% total losses
  const fatorRendimento = 1 - margemPerdas;
  const potenciaRecomendada = potenciaBruta / fatorRendimento;

  // Step 4: estimated annual production
  const energiaAnualEstimada = potenciaRecomendada * hsp * 365 * fatorRendimento;
  const coberturaPrevista = Math.min(100, (energiaAnualEstimada / consumoAnualAjustado) * 100);

  // Step 5: panel count scenarios for common wattages
  const WATTAGES = [300, 350, 400, 450, 500] as const;
  const cenariosPaineis = WATTAGES.map((wp) => {
    const quantidade = Math.ceil((potenciaRecomendada * 1000) / wp);
    return { potenciaWp: wp, quantidade, potenciaInstalada: Math.round(quantidade * wp) / 1000 };
  });

  // Panel count at reference 400 Wp
  const numPaineis = cenariosPaineis.find(c => c.potenciaWp === 400)!.quantidade;

  // ── Battery sizing ────────────────────────────────────────────────────────
  let capacidadeBateriaRecomendada: number | null = null;
  if (incluirBateria) {
    const percNoturno = 0.40;
    const energiaNoturna = consumoDiario * percNoturno * (horasAutonomia / (24 * percNoturno));
    capacidadeBateriaRecomendada = Math.ceil((energiaNoturna / 0.8) * 2) / 2; // round to 0.5 kWh, DoD=80%
  }

  const crescimentoTexto = crescimentoFuturo > 0
    ? ` (inclui ${crescimentoFuturo}% de crescimento futuro, passando a ${consumoAnualAjustado.toFixed(0)} kWh/ano)`
    : "";
  const explicacao =
    `Consumo base: ${consumoAnualBase.toFixed(0)} kWh/ano${crescimentoTexto} → ${consumoDiario.toFixed(1)} kWh/dia. ` +
    `Energia solar diária necessária (${coberturaMeta}% cobertura): ${energiaAlvoDiaria.toFixed(2)} kWh/dia. ` +
    `Com ${hsp.toFixed(2)} h de sol pico (HSP), potência bruta = ${potenciaBruta.toFixed(2)} kWp. ` +
    `Aplicando margem de ${(margemPerdas * 100).toFixed(0)}% para perdas (inversor, temperatura, sombreamento): ` +
    `${potenciaRecomendada.toFixed(2)} kWp instalados (≈${numPaineis} painéis de 400 Wp). ` +
    `Produção anual estimada: ${energiaAnualEstimada.toFixed(0)} kWh (${coberturaPrevista.toFixed(1)}% do consumo).` +
    (capacidadeBateriaRecomendada ? ` Bateria: ${capacidadeBateriaRecomendada} kWh para ${horasAutonomia}h de autonomia.` : "");

  res.json({
    consumoDiario: Math.round(consumoDiario * 10) / 10,
    consumoAnualAjustado: Math.round(consumoAnualAjustado),
    energiaAlvoDiaria: Math.round(energiaAlvoDiaria * 100) / 100,
    potenciaBruta: Math.round(potenciaBruta * 100) / 100,
    margemPerdas,
    fatorRendimento,
    potenciaRecomendada: Math.round(potenciaRecomendada * 100) / 100,
    numPaineis,
    energiaAnualEstimada: Math.round(energiaAnualEstimada),
    coberturaPrevista: Math.round(coberturaPrevista * 10) / 10,
    capacidadeBateriaRecomendada,
    hsp: Math.round(hsp * 100) / 100,
    cenariosPaineis,
    explicacao,
  });
});

// POST /tools/battery-size
router.post("/tools/battery-size", async (req, res): Promise<void> => {
  const {
    consumoDiario,
    percConsumoNoturno,
    horasAutonomia = 4,
    dod = 80,
  } = req.body as {
    consumoDiario: number;
    percConsumoNoturno: number;
    horasAutonomia?: number;
    tensaoSistema?: number;
    dod?: number;
  };

  if (consumoDiario === undefined || percConsumoNoturno === undefined) {
    res.status(400).json({ error: "consumoDiario e percConsumoNoturno são obrigatórios" });
    return;
  }

  const energiaNocturna =
    consumoDiario * (percConsumoNoturno / 100) * (horasAutonomia / ((24 * percConsumoNoturno) / 100 || 1));
  const capacidadeRecomendada = energiaNocturna / (dod / 100);
  const capacidadeUtilizavel = capacidadeRecomendada * (dod / 100);
  const numBaterias = Math.ceil(capacidadeRecomendada / 10);

  const explicacao = `Para um consumo diário de ${consumoDiario.toFixed(1)} kWh com ${percConsumoNoturno}% noturno e autonomia de ${horasAutonomia}h, a energia necessária à noite é ${energiaNocturna.toFixed(1)} kWh. Com profundidade de descarga (DoD) de ${dod}%, recomenda-se uma bateria de ${capacidadeRecomendada.toFixed(1)} kWh (capacidade utilizável: ${capacidadeUtilizavel.toFixed(1)} kWh). Equivale a ${numBaterias} módulo(s) de 10 kWh.`;

  res.json({
    capacidadeRecomendada: Math.round(capacidadeRecomendada * 10) / 10,
    capacidadeUtilizavel: Math.round(capacidadeUtilizavel * 10) / 10,
    energiaNocturna: Math.round(energiaNocturna * 10) / 10,
    numBaterias,
    explicacao,
  });
});

// POST /tools/import-datasheet
router.post("/tools/import-datasheet", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Ficheiro é obrigatório" });
    return;
  }

  const tipoEquipamento = req.body.tipoEquipamento as string;
  if (!["painel", "inversor", "bateria"].includes(tipoEquipamento)) {
    res.status(400).json({ error: "tipoEquipamento deve ser painel, inversor ou bateria" });
    return;
  }

  const { mimetype, buffer } = req.file;
  const isPdf = mimetype === "application/pdf";
  const isImage = mimetype.startsWith("image/");
  if (!isPdf && !isImage) {
    res.status(400).json({ error: "Formato não suportado. Use PDF ou imagem." });
    return;
  }

  const schemaByType: Record<string, string> = {
    painel: `{"nome":"string","fabricante":"string","potencia":number,"voc":number,"vmp":number,"isc":number,"imp":number,"coeficienteTemperatura":number}`,
    inversor: `{"nome":"string","fabricante":"string","potenciaAc":number,"potenciaDcMax":number,"mpptMin":number,"mpptMax":number,"corrMaxMppt":number,"numMppt":integer,"stringsPorMppt":integer}`,
    bateria: `{"nome":"string","fabricante":"string","capacidade":number,"tensao":number,"tecnologia":"LiFePO4|Li-ion|AGM|Gel"}`,
  };

  try {
    const base64 = buffer.toString("base64");
    const contentBlock = buildFileBlock(isPdf, mimetype, base64);

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Analisa esta ficha técnica de ${tipoEquipamento === "painel" ? "painel solar" : tipoEquipamento === "inversor" ? "inversor fotovoltaico" : "bateria de armazenamento"} e extrai os dados técnicos no seguinte formato JSON:
${schemaByType[tipoEquipamento]}

Devolve também:
- "confianca": valor 0-1 da confiança na extração
- "notas": avisos ou valores estimados

Responde APENAS com JSON, sem texto adicional.`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "{}";
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    const { confianca, notas, ...dados } = parsed;

    res.json({ tipoEquipamento, dados, confianca: confianca ?? 0.8, notas: notas ?? null });
  } catch (err) {
    req.log?.error({ err }, "import-datasheet AI error");
    res.status(502).json({ error: "Erro ao processar ficha técnica com IA" });
  }
});

export default router;
