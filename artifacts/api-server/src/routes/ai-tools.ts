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
              text: `Analisa esta fatura de eletricidade portuguesa e extrai os dados em JSON com exactamente estes campos:
{
  "consumoTotal": kWh total neste período de faturação (não anualizado) ou null,
  "consumoMensal": média mensal em kWh se o período for >1 mês, senão igual a consumoTotal, ou null,
  "consumoAnual": consumo anual em kWh se explicitamente indicado na fatura, senão null,
  "consumoPonta": kWh em horas de ponta (se tarifa bi/tri-horária) ou null,
  "consumoCheio": kWh em horas cheias (se tarifa bi/tri-horária) ou null,
  "consumoVazio": kWh em horas de vazio/super-vazio (se tarifa bi/tri-horária) ou null,
  "potenciaContratada": potência contratada em kVA ou null,
  "precoKwh": preço médio por kWh em EUR (sem IVA se indicado) ou null,
  "operador": nome da comercializadora (ex: EDP, Galp, Endesa, Iberdrola) ou null,
  "tarifario": tipo de tarifário: "simples", "bi-horária", "tri-horária" ou null,
  "dataInicio": data início do período em formato YYYY-MM-DD ou null,
  "dataFim": data fim do período em formato YYYY-MM-DD ou null,
  "periodoMeses": número de meses cobertos por esta fatura (normalmente 1 ou 2) ou null,
  "leiturasMensais": array de {"mes": "Abr 2024", "consumo": 312} com leituras individuais se disponíveis ou [],
  "confianca": número entre 0 e 1 representando confiança global na extração,
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
  const percVazioInput  = raw.percVazio  !== undefined ? Number(raw.percVazio)  : 40;
  const percCheioInput  = raw.percCheio  !== undefined ? Number(raw.percCheio)  : 35;
  const percPontaInput  = raw.percPonta  !== undefined ? Number(raw.percPonta)  : 25;
  // Normalize so the three always sum to 100
  const totalTarifa = percVazioInput + percCheioInput + percPontaInput || 100;
  const percVazio = Math.round((percVazioInput / totalTarifa) * 100);
  const percCheio = Math.round((percCheioInput / totalTarifa) * 100);
  const percPonta = 100 - percVazio - percCheio;

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

  // Step 3: theoretical minimum kWp after applying losses margin
  const margemPerdas = 0.22; // 22% total losses (inverter ~4%, temp ~5%, shading ~3%, wiring+soiling ~5%, mismatch ~5%)
  const fatorRendimento = 1 - margemPerdas;
  const potenciaMinima = potenciaBruta / fatorRendimento; // theoretical minimum — may not be a whole-panel multiple

  // Step 4: round up to whole panels (400 Wp reference) → actual installed power
  const numPaineis = Math.ceil((potenciaMinima * 1000) / 400);
  const potenciaInstalada = Math.round(numPaineis * 400) / 1000; // kWp after rounding up

  // Step 5: recalculate production and coverage from ACTUAL installed power (not theoretical)
  const energiaAnualEstimada = potenciaInstalada * hsp * 365 * fatorRendimento;
  const coberturaReal = Math.min(100, (energiaAnualEstimada / consumoAnualAjustado) * 100);

  // Keep potenciaRecomendada = potenciaInstalada (actual) for API consumers; expose potenciaMinima separately
  const potenciaRecomendada = potenciaInstalada;
  const coberturaPrevista = coberturaReal; // real coverage (≥ coberturaMeta due to ceil rounding)

  // Step 6: panel count scenarios — each with its own actual installed power + coverage
  const WATTAGES = [300, 350, 400, 450, 500] as const;
  const cenariosPaineis = WATTAGES.map((wp) => {
    const quantidade = Math.ceil((potenciaMinima * 1000) / wp);
    const potInst = Math.round(quantidade * wp) / 1000;
    const energiaAnual = Math.round(potInst * hsp * 365 * fatorRendimento);
    const coberturaScenario = Math.min(100, Math.round((energiaAnual / consumoAnualAjustado) * 1000) / 10);
    return { potenciaWp: wp, quantidade, potenciaInstalada: potInst, energiaAnual, coberturaReal: coberturaScenario };
  });

  // ── Battery sizing (tariff-aware) ─────────────────────────────────────────
  // Vazio = off-peak hours (PT: 22h–8h ≈ 10h/day) → this is what the battery must cover
  // Battery capacity = (daily vazio consumption × autonomy fraction) / DoD
  let capacidadeBateriaRecomendada: number | null = null;
  if (incluirBateria) {
    const energiaVazioDiaria = consumoDiario * (percVazio / 100);
    const horasVazioWindow = 10; // PT off-peak window ≈ 10h
    const energiaBateriaNeeded = energiaVazioDiaria * (horasAutonomia / horasVazioWindow);
    capacidadeBateriaRecomendada = Math.ceil((energiaBateriaNeeded / 0.8) * 2) / 2; // DoD=80%, round to 0.5 kWh
  }

  const crescimentoTexto = crescimentoFuturo > 0
    ? ` (inclui ${crescimentoFuturo}% de crescimento futuro → ${consumoAnualAjustado.toFixed(0)} kWh/ano)`
    : "";
  const tarifaTexto = capacidadeBateriaRecomendada
    ? ` Bateria dimensionada com base em ${percVazio}% de consumo em vazio (período noturno): ${capacidadeBateriaRecomendada} kWh para ${horasAutonomia}h de autonomia.`
    : "";
  const explicacao =
    `Consumo base: ${consumoAnualBase.toFixed(0)} kWh/ano${crescimentoTexto} → ${consumoDiario.toFixed(1)} kWh/dia. ` +
    `Energia solar diária alvo (${coberturaMeta}% cobertura): ${energiaAlvoDiaria.toFixed(2)} kWh/dia. ` +
    `Com ${hsp.toFixed(2)} h/dia de sol pico (HSP), potência bruta = ${potenciaBruta.toFixed(2)} kWp. ` +
    `Após margem de ${(margemPerdas * 100).toFixed(0)}% de perdas: potência mínima teórica = ${potenciaMinima.toFixed(2)} kWp. ` +
    `Arredondando para cima: ${numPaineis} painéis × 400 Wp = ${potenciaInstalada.toFixed(2)} kWp instalados. ` +
    `Produção anual real estimada: ${energiaAnualEstimada.toFixed(0)} kWh → cobertura real ${coberturaReal.toFixed(1)}% ` +
    `(superior aos ${coberturaMeta}% alvo devido ao arredondamento de painéis).` +
    tarifaTexto;

  res.json({
    consumoDiario: Math.round(consumoDiario * 10) / 10,
    consumoAnualAjustado: Math.round(consumoAnualAjustado),
    energiaAlvoDiaria: Math.round(energiaAlvoDiaria * 100) / 100,
    potenciaBruta: Math.round(potenciaBruta * 100) / 100,
    margemPerdas,
    fatorRendimento,
    potenciaMinima: Math.round(potenciaMinima * 100) / 100,       // theoretical minimum
    potenciaInstalada: Math.round(potenciaInstalada * 100) / 100, // actual after rounding panels
    potenciaRecomendada: Math.round(potenciaRecomendada * 100) / 100, // = potenciaInstalada (compat)
    numPaineis,
    energiaAnualEstimada: Math.round(energiaAnualEstimada),
    coberturaPrevista: Math.round(coberturaPrevista * 10) / 10,   // = coberturaReal (compat)
    coberturaAlvo: coberturaMeta,
    coberturaReal: Math.round(coberturaReal * 10) / 10,
    capacidadeBateriaRecomendada,
    hsp: Math.round(hsp * 100) / 100,
    percVazio,
    percCheio,
    percPonta,
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

  const nomeTipo = tipoEquipamento === "painel" ? "painel solar" : tipoEquipamento === "inversor" ? "inversor fotovoltaico" : "bateria de armazenamento";

  const schemaByType: Record<string, string> = {
    painel: `{"nome":"string","fabricante":"string","potencia":number,"voc":number,"vmp":number,"isc":number,"imp":number,"coeficienteTemperatura":number}`,
    inversor: `{"nome":"string","fabricante":"string","potenciaAc":number,"potenciaDcMax":number,"mpptMin":number,"mpptMax":number,"corrMaxMppt":number,"numMppt":number,"stringsPorMppt":number}`,
    bateria: `{"nome":"string","fabricante":"string","capacidade":number,"tensao":number,"tecnologia":"LiFePO4|Li-ion|AGM|Gel"}`,
  };

  try {
    const base64 = buffer.toString("base64");
    const contentBlock = buildFileBlock(isPdf, mimetype, base64);

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Analisa esta ficha técnica de ${nomeTipo}.

REGRA FUNDAMENTAL: fichas técnicas frequentemente apresentam VÁRIOS MODELOS em paralelo numa tabela comparativa (uma coluna por modelo). Identifica TODOS os modelos presentes no documento e extrai os dados de cada um individualmente.

Para cada modelo encontrado, extrai os campos no seguinte formato:
${schemaByType[tipoEquipamento]}

Devolve um objeto JSON com EXATAMENTE esta estrutura:
{
  "modelos": [ <array com um objeto por modelo, usando o schema acima> ],
  "confianca": <número 0-1 da confiança geral na extração>,
  "notas": <string com observações, ex. "5 modelos detetados na tabela comparativa da pág. 2"> ou null
}

Instruções importantes:
- Se a tabela tiver colunas por modelo (ex: SUN-14K, SUN-15K, SUN-16K...), cria um registo separado para cada coluna.
- Associa cada valor ao modelo correto — não mistures dados entre modelos.
- Para inversores: potenciaAc e potenciaDcMax em Watts (W), mpptMin/mpptMax em Volts (V), corrMaxMppt em Amperes (A).
- Para painéis: potencia em Watts pico (Wp), tensões em Volts, correntes em Amperes, coeficienteTemperatura em %/°C (valor negativo, ex: -0.35).
- Para baterias: capacidade em kWh, tensao em Volts.
- Se um valor não estiver disponível para um modelo, usa 0 (nunca null nos campos numéricos).
- fabricante deve ser o mesmo para todos os modelos da mesma ficha.

Responde APENAS com o JSON pedido, sem texto adicional, sem markdown.`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "{}";
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(clean) as { modelos?: Record<string, unknown>[]; confianca?: number; notas?: string | null };

    const modelos: Record<string, unknown>[] = Array.isArray(parsed.modelos) && parsed.modelos.length > 0
      ? parsed.modelos
      : [parsed as Record<string, unknown>];

    res.json({
      tipoEquipamento,
      modelos,
      dados: modelos[0],
      confianca: parsed.confianca ?? 0.8,
      notas: parsed.notas ?? null,
    });
  } catch (err) {
    req.log?.error({ err }, "import-datasheet AI error");
    res.status(502).json({ error: "Erro ao processar ficha técnica com IA" });
  }
});

export default router;
