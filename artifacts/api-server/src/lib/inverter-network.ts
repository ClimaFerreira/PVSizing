export type InverterNetworkType = "monofasico" | "trifasico" | "desconhecido";

export interface InverterNetworkData {
  tipoRede?: unknown;
  ligacaoRede?: unknown;
  tensaoAcNominal?: unknown;
  faixaTensaoAc?: unknown;
  fabricante?: unknown;
  nome?: unknown;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function inferInverterNetworkType(data: InverterNetworkData): InverterNetworkType {
  if (data.tipoRede === "monofasico" || data.tipoRede === "trifasico") return data.tipoRede;

  const connection = normalizeText(data.ligacaoRede);
  if (/(?:^|\s)3(?:l|p|f)\s*\+\s*n\s*\+\s*pe(?:\s|$)|3l\+n\+pe|3p\+n\+pe/.test(connection)) return "trifasico";
  if (/(?:^|\s)(?:l|1p|1f)\s*\+\s*n\s*\+\s*pe(?:\s|$)|l\+n\+pe|1p\+n\+pe|1f\+n\+pe/.test(connection)) return "monofasico";

  const voltage = normalizeText(`${data.tensaoAcNominal ?? ""} ${data.faixaTensaoAc ?? ""}`);
  if (/\b(?:220\s*\/\s*380|230\s*\/\s*400|380\s*\/\s*400)\b|\b(?:380|400)\s*v\b/.test(voltage)) return "trifasico";
  if (/\b220\s*\/\s*230\b|\b230\s*v\b/.test(voltage)) return "monofasico";

  const text = normalizeText(`${data.fabricante ?? ""} ${data.nome ?? ""}`);
  if (/three[\s-]*phase|trifas|sg0?5lp3|sg04lp3|lp3(?:\b|-)|(?:\b|-)p3(?:\b|-)/.test(text)) return "trifasico";
  if (/single[\s-]*phase|monofas|sg0?5lp1|lp1(?:\b|-)|eu-am2/.test(text)) return "monofasico";
  return "desconhecido";
}

export function normalizeImportedInverterNetwork<T extends InverterNetworkData>(data: T): T & {
  tipoRede: InverterNetworkType;
  tensaoAcNominal: string;
  faixaTensaoAc: string;
  ligacaoRede: string;
} {
  const model = normalizeText(data.nome);
  const isLp3 = /sg0?5lp3|lp3(?:\b|-)/.test(model);
  const isLp1 = /sg0?5lp1|lp1(?:\b|-)/.test(model);
  const voltage = String(data.tensaoAcNominal ?? "").trim();
  const voltageRange = String(data.faixaTensaoAc ?? "").trim();
  const connection = String(data.ligacaoRede ?? "").trim();
  return {
    ...data,
    tipoRede: inferInverterNetworkType(data),
    tensaoAcNominal: voltage || (isLp3 ? "220/380 V, 230/400 V" : isLp1 ? "220/230 V" : ""),
    faixaTensaoAc: voltageRange || ((isLp3 || isLp1) ? "0.85Un-1.1Un" : ""),
    ligacaoRede: connection || (isLp3 ? "3L+N+PE" : isLp1 ? "L+N+PE" : ""),
  };
}

export function inverterNetworkColumnsForWrite(data: InverterNetworkData) {
  const explicitType =
    data.tipoRede === "monofasico" || data.tipoRede === "trifasico" || data.tipoRede === "desconhecido"
      ? data.tipoRede
      : null;
  return {
    tipoRede: explicitType ?? inferInverterNetworkType(data),
    tensaoAcNominal: String(data.tensaoAcNominal ?? "").trim() || null,
    faixaTensaoAc: String(data.faixaTensaoAc ?? "").trim() || null,
    ligacaoRede: String(data.ligacaoRede ?? "").trim() || null,
  };
}
