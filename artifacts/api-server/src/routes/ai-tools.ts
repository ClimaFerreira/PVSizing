import { Router, type IRouter } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, invertersTable, batteriesTable } from "@workspace/db";

const router: IRouter = Router();

// ── File upload (memory, 10 MB, MIME filter) ──────────────────────────────────
const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(
          new Error("Formato não suportado. Use PDF ou imagem (JPEG, PNG, WebP)."),
          { status: 415 },
        ),
      );
    }
  },
});

// ── Rate limiters ─────────────────────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    req.log?.warn({ ip: req.ip }, "AI rate limit exceeded");
    res
      .status(429)
      .json({ error: "Demasiadas chamadas à IA. Aguarde 1 minuto e tente novamente." });
  },
});

const calcLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res
      .status(429)
      .json({ error: "Demasiadas chamadas. Tente novamente em breve." });
  },
});

// ── Zod schemas ───────────────────────────────────────────────────────────────
const AutoSizeBodySchema = z.object({
  consumoAnual: z.coerce.number().positive("consumoAnual deve ser positivo"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  inclinacao: z.coerce.number().min(0).max(90).default(30),
  azimute: z.coerce.number().min(-180).max(180).default(0),
  coberturaMeta: z.coerce.number().min(10).max(200).default(80),
  incluirBateria: z
    .union([z.boolean(), z.string().transform((v) => v === "true")])
    .default(false),
  horasAutonomia: z.coerce.number().min(1).max(24).default(4),
  crescimentoFuturo: z.coerce.number().min(0).max(100).default(0),
  percVazio: z.coerce.number().min(0).max(100).default(40),
  percCheio: z.coerce.number().min(0).max(100).default(35),
  percPonta: z.coerce.number().min(0).max(100).default(25),
  precoKwh: z.coerce.number().min(0).max(10).default(0.18),
});

const BatterySizeBodySchema = z.object({
  consumoDiario: z.coerce.number().positive("consumoDiario deve ser positivo"),
  percConsumoNoturno: z.coerce.number().min(0).max(100),
  horasAutonomia: z.coerce.number().min(1).max(24).default(4),
  dod: z.coerce.number().min(10).max(100).default(80),
});

// ── Monthly irradiance factors for Portugal ───────────────────────────────────
const PT_MONTHLY_FACTORS = [
  0.577, 0.721, 0.954, 1.065, 1.243, 1.420, 1.498, 1.376, 1.132, 0.866, 0.621, 0.510,
];
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

type ImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const VALID_IMAGE_MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function toSafeImageMime(mime: string): ImageMime {
  return VALID_IMAGE_MIMES.includes(mime as ImageMime) ? (mime as ImageMime) : "image/jpeg";
}

function buildFileBlock(isPdf: boolean, mime: string, base64: string) {
  if (isPdf) {
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
    };
  }
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: toSafeImageMime(mime),
      data: base64,
    },
  };
}

interface CenarioParams {
  tipo: "conservador" | "equilibrado" | "agressivo";
  coberturaMeta: number;
  consumoAnualAjustado: number;
  hsp: number;
  fatorRendimento: number;
  precoKwh: number;
  custoKwp: number;
  incluirBateria: boolean;
  capacidadeBateriaBase: number | null;
  custoBateria: number;
}

function buildCenario(p: CenarioParams) {
  const consumoDiario = p.consumoAnualAjustado / 365;

  const energiaAlvoDiaria = consumoDiario * (p.coberturaMeta / 100);
  const potenciaBruta = energiaAlvoDiaria / p.hsp;
  const potenciaMinima = potenciaBruta / p.fatorRendimento;
  const numPaineis = Math.ceil((potenciaMinima * 1000) / 400);
  const potenciaInstalada = Math.round(numPaineis * 400) / 1000;

  const producaoMensal = PT_MONTHLY_FACTORS.map((factor, m) =>
    Math.round(
      potenciaInstalada * p.hsp * factor * DAYS_PER_MONTH[m] * p.fatorRendimento,
    ),
  );

  const consumoMensal = DAYS_PER_MONTH.map((days) =>
    Math.round((p.consumoAnualAjustado / 365) * days),
  );

  const autoconsumoMensal = producaoMensal.map((prod, m) =>
    Math.min(prod, consumoMensal[m]),
  );
  const excessoMensal = producaoMensal.map((prod, m) =>
    Math.max(0, prod - consumoMensal[m]),
  );

  const energiaAnualEstimada = producaoMensal.reduce((a, b) => a + b, 0);
  const coberturaReal = Math.round(
    (energiaAnualEstimada / p.consumoAnualAjustado) * 100,
  );
  const autoconsumoAnual = autoconsumoMensal.reduce((a, b) => a + b, 0);
  const excessoAnual = excessoMensal.reduce((a, b) => a + b, 0);
  const autoconsumoPerc =
    energiaAnualEstimada > 0
      ? Math.round((autoconsumoAnual / energiaAnualEstimada) * 100)
      : 0;

  const investPV = Math.round(potenciaInstalada * p.custoKwp);
  const investBat =
    p.incluirBateria && p.capacidadeBateriaBase
      ? Math.round(p.capacidadeBateriaBase * p.custoBateria)
      : 0;
  const investimentoEstimado = investPV + investBat;
  const poupancaAnual = Math.round(autoconsumoAnual * p.precoKwh * 100) / 100;
  const paybackAnos =
    poupancaAnual > 0
      ? Math.round((investimentoEstimado / poupancaAnual) * 10) / 10
      : 99;

  const META: Record<string, { label: string; descricao: string }> = {
    conservador: {
      label: "Económico",
      descricao: "Menor investimento inicial, melhor autoconsumo relativo e retorno mais rápido",
    },
    equilibrado: {
      label: "Equilibrado",
      descricao: "Bom equilíbrio entre cobertura anual, autoconsumo e retorno financeiro",
    },
    agressivo: {
      label: "Premium",
      descricao: "Máxima cobertura e produção solar — maior investimento, benefícios a longo prazo",
    },
  };

  return {
    tipo: p.tipo,
    label: META[p.tipo].label,
    descricao: META[p.tipo].descricao,
    potenciaInstalada: Math.round(potenciaInstalada * 100) / 100,
    numPaineis,
    energiaAnualEstimada,
    coberturaReal,
    producaoMensal,
    consumoMensal,
    autoconsumoMensal,
    excessoMensal,
    autoconsumoAnual,
    excessoAnual,
    autoconsumoPerc,
    investimentoEstimado,
    poupancaAnual,
    paybackAnos,
    capacidadeBateriaRecomendada: p.incluirBateria ? p.capacidadeBateriaBase : null,
  };
}

type DbInverter = typeof invertersTable.$inferSelect;
type DbBattery = typeof batteriesTable.$inferSelect;
type RawCenario = ReturnType<typeof buildCenario>;

function matchInversor(potenciaKwp: number, allInverters: DbInverter[]) {
  if (allInverters.length === 0) return null;
  let best: DbInverter | null = null;
  let bestUnits = Infinity;
  let bestOversizing = Infinity;
  for (const inv of allInverters) {
    const potAc = Number(inv.potenciaAc);
    if (!potAc || potAc <= 0) continue;
    const units = Math.ceil(potenciaKwp / potAc);
    const oversizing = units * potAc - potenciaKwp;
    if (units < bestUnits || (units === bestUnits && oversizing < bestOversizing)) {
      best = inv;
      bestUnits = units;
      bestOversizing = oversizing;
    }
  }
  if (!best) return null;
  return {
    id: best.id,
    nome: best.nome,
    fabricante: best.fabricante,
    potenciaAc: Number(best.potenciaAc),
    numUnidades: bestUnits,
  };
}

function matchBateria(capacidadeKwh: number | null, allBatteries: DbBattery[]) {
  if (!capacidadeKwh || capacidadeKwh <= 0 || allBatteries.length === 0) return null;
  const valid = allBatteries.filter((b) => Number(b.capacidade) > 0);
  if (valid.length === 0) return null;
  const bigger = valid.filter((b) => Number(b.capacidade) >= capacidadeKwh);
  const best =
    bigger.length > 0
      ? bigger.reduce((min, b) =>
          Number(b.capacidade) < Number(min.capacidade) ? b : min,
        )
      : valid.reduce((max, b) =>
          Number(b.capacidade) > Number(max.capacidade) ? b : max,
        );
  return {
    id: best.id,
    nome: best.nome,
    fabricante: best.fabricante,
    capacidade: Number(best.capacidade),
  };
}

function generateAlertas(
  c: RawCenario,
): Array<{ tipo: "info" | "aviso" | "erro"; mensagem: string }> {
  const out: Array<{ tipo: "info" | "aviso" | "erro"; mensagem: string }> = [];
  if (c.coberturaReal < 60) {
    out.push({
      tipo: "aviso",
      mensagem: `Cobertura de ${c.coberturaReal}% — sistema subdimensionado para o consumo indicado.`,
    });
  } else if (c.coberturaReal > 115) {
    out.push({
      tipo: "info",
      mensagem: `Cobertura de ${c.coberturaReal}% — excedente elevado no verão; considere autoconsumo colectivo.`,
    });
  }
  if (c.paybackAnos > 13) {
    out.push({
      tipo: "aviso",
      mensagem: `Retorno em ${c.paybackAnos} anos — verifique subsídios disponíveis (SRP, InvestPortugal).`,
    });
  }
  if (c.potenciaInstalada > 10) {
    out.push({
      tipo: "info",
      mensagem: `Sistema de ${c.potenciaInstalada} kWp pode requerer licenciamento DGEG.`,
    });
  }
  if (c.autoconsumoPerc < 50) {
    out.push({
      tipo: "aviso",
      mensagem: `Autoconsumo de ${c.autoconsumoPerc}% — grande parte da produção é injectada na rede.`,
    });
  }
  if (c.capacidadeBateriaRecomendada && c.capacidadeBateriaRecomendada > 0) {
    out.push({
      tipo: "info",
      mensagem: `Bateria de ${c.capacidadeBateriaRecomendada} kWh recomendada para maximizar autoconsumo nocturno.`,
    });
  }
  return out;
}

// ── POST /tools/parse-invoice ─────────────────────────────────────────────────
router.post(
  "/tools/parse-invoice",
  aiLimiter,
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Ficheiro é obrigatório" });
      return;
    }

    const { mimetype, buffer, size } = req.file;
    const isPdf = mimetype === "application/pdf";
    const isImage = mimetype.startsWith("image/");

    if (!isPdf && !isImage) {
      res.status(415).json({ error: "Formato não suportado. Use PDF ou imagem." });
      return;
    }

    req.log.info({ mimetype, size }, "parse-invoice: processing file");

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
                text: `És um especialista em faturas de eletricidade portuguesas. A tua tarefa principal é extrair dados de consumo, com foco especial no GRÁFICO DE BARRAS DO HISTÓRICO DE CONSUMO.

════════════════════════════════════════
PASSO 1 — LOCALIZA O GRÁFICO DE BARRAS
════════════════════════════════════════
Quase todas as faturas portuguesas (EDP, Endesa, Galp, Iberdrola, BTN, etc.) incluem uma secção visual chamada "Gráfico de consumo mensal" ou "Histórico de consumo". É um gráfico de barras verticais com:
• Eixo X: abreviações dos meses (jan, fev, mar, abr, mai, jun, jul, ago, set, out, nov, dez)
• Eixo Y: valores em kWh (ex: 0, 500, 1000, 1500, 2000, 2500, 3000, 3500)
• Normalmente 12 a 14 barras representando o histórico dos últimos 12-13 meses
• Pode estar na parte inferior ou lateral da fatura

PROCURA este gráfico mesmo que esteja pequeno, em tons de cinza, ou que as barras não tenham rótulos numéricos.

════════════════════════════════════════
PASSO 2 — LÊ O GRÁFICO VISUALMENTE (OBRIGATÓRIO)
════════════════════════════════════════
Se encontrares o gráfico:
1. Identifica a escala do eixo Y: lê os valores marcados (ex: 0, 500, 1000, 1500, 2000, 2500, 3000, 3500)
2. Para cada barra, estima a sua altura como percentagem do valor máximo do eixo Y
3. Calcula o valor em kWh: altura_percentagem × valor_maximo_eixo_Y
4. Exemplo: se o eixo Y vai até 3500 kWh e uma barra atinge ~70% da altura → 3500 × 0,70 = 2450 kWh

REGRA ABSOLUTA: Se vires barras no gráfico, TENS de estimar os valores mesmo sem rótulos. Nunca retornes [] se houver barras visíveis. A precisão não precisa de ser perfeita — uma estimativa razoável é muito melhor do que nenhum dado.

════════════════════════════════════════
PASSO 3 — EXTRAI O JSON
════════════════════════════════════════
Devolve APENAS este JSON (sem texto adicional, sem markdown):

{
  "consumoTotal": kWh total neste período de faturação (não anualizado) ou null,
  "consumoMensal": média mensal em kWh se o período for >1 mês, senão igual a consumoTotal, ou null,
  "consumoAnual": consumo anual em kWh se explicitamente indicado na fatura, senão null,
  "consumoPonta": kWh em horas de ponta (se tarifa bi/tri-horária) ou null,
  "consumoCheio": kWh em horas cheias (se tarifa bi/tri-horária) ou null,
  "consumoVazio": kWh em horas de vazio/super-vazio (se tarifa bi/tri-horária) ou null,
  "potenciaContratada": potência contratada em kVA ou null,
  "precoKwh": preço médio por kWh em EUR (inclui energia + redes + impostos se possível) ou null,
  "operador": nome da comercializadora (ex: "EDP", "Galp", "Endesa", "Iberdrola", "Casa do Povo de Valongo do Vouga") ou null,
  "tarifario": "simples", "bi-horária" ou "tri-horária" ou null,
  "dataInicio": data início do período em formato YYYY-MM-DD ou null,
  "dataFim": data fim do período em formato YYYY-MM-DD ou null,
  "periodoMeses": número de meses cobertos por esta fatura (normalmente 1 ou 2) ou null,
  "leiturasMensais": array de {"mes": "Abr 2024", "consumo": 312} com leituras de texto/tabela (não do gráfico), ou [],
  "historicoMensalGrafico": array com TODOS os meses visíveis no gráfico de barras. Formato: [{"mes": "Fev 2025", "consumo": 2000}, {"mes": "Mar 2025", "consumo": 2500}, ...]. Usa os meses do eixo X e o ano da fatura para construir as datas correctas (o mês mais à direita é o mês actual da fatura; os anteriores são meses anteriores em ordem cronológica). Se não existir NENHUM gráfico de barras, retorna []. NUNCA retornas [] se houver barras visíveis.,
  "mesesNoGrafico": número total de barras/meses visíveis no gráfico (0 apenas se não houver gráfico),
  "consumoAnualGrafico": soma de todos os valores do historicoMensalGrafico se tiver ≥12 entradas; se tiver <12 entradas, calcula (soma ÷ número_meses) × 12; null se não houver gráfico,
  "sazonalidade": "verao_pico" se Jun-Set claramente superior, "inverno_pico" se Nov-Mar claramente superior, "uniforme" se sem variação clara, null se sem dados,
  "confianca": número 0.0 a 1.0 (0.9+ se valores explícitos; 0.6-0.8 se estimados visualmente; reduz se dados contraditórios),
  "notas": descreve brevemente o gráfico encontrado (ex: "Gráfico de consumo mensal com 13 barras, fev 2025 a fev 2026, pico em dez-jan ~3000 kWh") ou null se sem gráfico
}`,
              },
            ],
          },
        ],
      });

      const text =
        message.content[0].type === "text" ? message.content[0].text : "{}";
      const clean = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(clean);
      res.json(data);
    } catch (err) {
      req.log?.error({ err }, "parse-invoice AI error");
      res.status(502).json({ error: "Erro ao processar fatura com IA" });
    }
  },
);

// ── POST /tools/auto-size ─────────────────────────────────────────────────────
router.post("/tools/auto-size", calcLimiter, async (req, res): Promise<void> => {
  const parsed = AutoSizeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    res.status(400).json({ error: `Dados inválidos: ${msg}` });
    return;
  }

  const {
    consumoAnual: consumoAnualBase,
    latitude,
    longitude,
    inclinacao,
    azimute,
    coberturaMeta,
    incluirBateria,
    horasAutonomia,
    crescimentoFuturo,
    percVazio: percVazioInput,
    percCheio: percCheioInput,
    percPonta: percPontaInput,
    precoKwh,
  } = parsed.data;

  const totalTarifa = percVazioInput + percCheioInput + percPontaInput || 100;
  const percVazio = Math.round((percVazioInput / totalTarifa) * 100);
  const percCheio = Math.round((percCheioInput / totalTarifa) * 100);
  const percPonta = 100 - percVazio - percCheio;

  const consumoAnualAjustado = consumoAnualBase * (1 + crescimentoFuturo / 100);
  const consumoDiario = consumoAnualAjustado / 365;

  const latRad = (Math.abs(latitude) * Math.PI) / 180;
  const baseHsp = 5.2 - latRad * 1.8;
  const tiltFactor = 1 - Math.abs(inclinacao - 35) * 0.005;
  const azimuthFactor = 1 - Math.abs(azimute) * 0.003;
  const hsp = Math.max(2.5, baseHsp * tiltFactor * azimuthFactor);

  const margemPerdas = 0.22;
  const fatorRendimento = 1 - margemPerdas;

  let capacidadeBateriaRecomendada: number | null = null;
  if (incluirBateria) {
    const energiaVazioDiaria = consumoDiario * (percVazio / 100);
    const horasVazioWindow = 10;
    const energiaBateriaNeeded =
      energiaVazioDiaria * (horasAutonomia / horasVazioWindow);
    capacidadeBateriaRecomendada = Math.ceil((energiaBateriaNeeded / 0.8) * 2) / 2;
  }

  const custoKwp = 1050;
  const custoBateria = 600;

  const coberturaConservador = coberturaMeta * 0.68;
  const coberturaEquilibrado = coberturaMeta * 1.0;
  const coberturaAgressivo = coberturaMeta * 1.35;

  const cenParams = {
    consumoAnualAjustado,
    hsp,
    fatorRendimento,
    precoKwh,
    custoKwp,
    incluirBateria,
    capacidadeBateriaBase: capacidadeBateriaRecomendada,
    custoBateria,
  };

  const cenConservador = buildCenario({
    tipo: "conservador",
    coberturaMeta: coberturaConservador,
    ...cenParams,
  });
  const cenEquilibrado = buildCenario({
    tipo: "equilibrado",
    coberturaMeta: coberturaEquilibrado,
    ...cenParams,
  });
  const cenAgressivo = buildCenario({
    tipo: "agressivo",
    coberturaMeta: coberturaAgressivo,
    ...cenParams,
  });

  const candidates = [cenConservador, cenEquilibrado, cenAgressivo];
  const minCoberturaThreshold = coberturaMeta * 0.6;
  const eligible = candidates.filter(
    (c) => c.coberturaReal >= minCoberturaThreshold,
  );
  const recomendado = (
    eligible.length > 0
      ? eligible.reduce((best, c) =>
          c.paybackAnos < best.paybackAnos ? c : best,
        )
      : cenEquilibrado
  ).tipo;

  const potenciaInstalada = cenEquilibrado.potenciaInstalada;
  const numPaineis = cenEquilibrado.numPaineis;
  const potenciaMinima =
    Math.round(
      (((consumoAnualAjustado / 365) * (coberturaMeta / 100)) /
        hsp /
        fatorRendimento) *
        100,
    ) / 100;
  const energiaAnualEstimada = cenEquilibrado.energiaAnualEstimada;
  const coberturaReal = cenEquilibrado.coberturaReal;
  const potenciaRecomendada = potenciaInstalada;
  const coberturaPrevista = coberturaReal;

  const WATTAGES = [300, 350, 400, 450, 500] as const;
  const cenariosPaineis = WATTAGES.map((wp) => {
    const quantidade = Math.ceil((potenciaMinima * 1000) / wp);
    const potInst = Math.round(quantidade * wp) / 1000;
    const energiaAnual = Math.round(potInst * hsp * 365 * fatorRendimento);
    const coberturaScenario = Math.min(
      100,
      Math.round((energiaAnual / consumoAnualAjustado) * 1000) / 10,
    );
    return {
      potenciaWp: wp,
      quantidade,
      potenciaInstalada: potInst,
      energiaAnual,
      coberturaReal: coberturaScenario,
    };
  });

  const crescimentoTexto =
    crescimentoFuturo > 0
      ? ` (inclui ${crescimentoFuturo}% de crescimento futuro → ${consumoAnualAjustado.toFixed(0)} kWh/ano)`
      : "";
  const tarifaTexto = capacidadeBateriaRecomendada
    ? ` Bateria dimensionada com base em ${percVazio}% de consumo em vazio (período noturno): ${capacidadeBateriaRecomendada} kWh para ${horasAutonomia}h de autonomia.`
    : "";
  const explicacao =
    `Consumo base: ${consumoAnualBase.toFixed(0)} kWh/ano${crescimentoTexto} → ${consumoDiario.toFixed(1)} kWh/dia. ` +
    `HSP estimado: ${hsp.toFixed(2)} h/dia. Fator de rendimento: ${(fatorRendimento * 100).toFixed(0)}%. ` +
    `Cenário Equilibrado (${coberturaMeta}% cobertura): ${numPaineis} painéis × 400 Wp = ${potenciaInstalada} kWp instalados, ` +
    `produção anual ${energiaAnualEstimada.toLocaleString("pt-PT")} kWh → cobertura real ${coberturaReal}%.` +
    tarifaTexto;

  const [allInverters, allBatteries] = await Promise.all([
    db.select().from(invertersTable),
    incluirBateria
      ? db.select().from(batteriesTable)
      : Promise.resolve<(typeof batteriesTable.$inferSelect)[]>([]),
  ]);

  const enrichCenario = (c: RawCenario) => ({
    ...c,
    inversorRecomendado: matchInversor(c.potenciaInstalada, allInverters),
    bateriaRecomendada: matchBateria(
      c.capacidadeBateriaRecomendada,
      allBatteries,
    ),
    alertas: generateAlertas(c),
  });

  res.json({
    consumoDiario: Math.round(consumoDiario * 10) / 10,
    consumoAnualAjustado: Math.round(consumoAnualAjustado),
    energiaAlvoDiaria:
      Math.round(
        ((consumoDiario * (coberturaMeta / 100)) * 100) / 100,
      ),
    potenciaBruta:
      Math.round(
        ((consumoDiario * (coberturaMeta / 100)) / hsp) * 100,
      ) / 100,
    margemPerdas,
    fatorRendimento,
    potenciaMinima,
    potenciaInstalada: Math.round(potenciaInstalada * 100) / 100,
    potenciaRecomendada: Math.round(potenciaRecomendada * 100) / 100,
    numPaineis,
    energiaAnualEstimada,
    coberturaPrevista,
    coberturaAlvo: coberturaMeta,
    coberturaReal,
    capacidadeBateriaRecomendada,
    hsp: Math.round(hsp * 100) / 100,
    percVazio,
    percCheio,
    percPonta,
    cenariosPaineis,
    cenariosDimensionamento: [
      enrichCenario(cenConservador),
      enrichCenario(cenEquilibrado),
      enrichCenario(cenAgressivo),
    ],
    recomendado,
    explicacao,
    _monthLabels: MONTH_LABELS,
  });
});

// ── POST /tools/battery-size ──────────────────────────────────────────────────
router.post(
  "/tools/battery-size",
  calcLimiter,
  async (req, res): Promise<void> => {
    const parsed = BatterySizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      res.status(400).json({ error: `Dados inválidos: ${msg}` });
      return;
    }

    const { consumoDiario, percConsumoNoturno, horasAutonomia, dod } =
      parsed.data;

    const energiaNocturna =
      consumoDiario *
      (percConsumoNoturno / 100) *
      (horasAutonomia / (((24 * percConsumoNoturno) / 100) || 1));
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
  },
);

// ── POST /tools/import-datasheet ──────────────────────────────────────────────
router.post(
  "/tools/import-datasheet",
  aiLimiter,
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Ficheiro é obrigatório" });
      return;
    }

    const tipoEquipamento = req.body.tipoEquipamento as string;
    if (!["painel", "inversor", "bateria"].includes(tipoEquipamento)) {
      res.status(400).json({
        error: "tipoEquipamento deve ser painel, inversor ou bateria",
      });
      return;
    }

    const { mimetype, buffer, size } = req.file;
    const isPdf = mimetype === "application/pdf";
    const isImage = mimetype.startsWith("image/");
    if (!isPdf && !isImage) {
      res
        .status(415)
        .json({ error: "Formato não suportado. Use PDF ou imagem." });
      return;
    }

    req.log.info({ mimetype, size, tipoEquipamento }, "import-datasheet: processing file");

    const nomeTipo =
      tipoEquipamento === "painel"
        ? "painel solar"
        : tipoEquipamento === "inversor"
          ? "inversor fotovoltaico"
          : "bateria de armazenamento";

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

      const text =
        message.content[0].type === "text" ? message.content[0].text : "{}";
      const clean = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const parsed = JSON.parse(clean) as {
        modelos?: Record<string, unknown>[];
        confianca?: number;
        notas?: string | null;
      };

      const modelos: Record<string, unknown>[] =
        Array.isArray(parsed.modelos) && parsed.modelos.length > 0
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
  },
);

export default router;
