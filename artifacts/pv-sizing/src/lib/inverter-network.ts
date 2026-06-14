export type InverterNetworkType = "monofasico" | "trifasico" | "desconhecido";

export interface InverterNetworkData {
  tipoRede?: unknown;
  ligacaoRede?: unknown;
  formaLigacaoRede?: unknown;
  tensaoAcNominal?: unknown;
  tensaoAcSaida?: unknown;
  faixaTensaoAc?: unknown;
  rangeTensaoAc?: unknown;
  fabricante?: unknown;
  nome?: unknown;
  modelo?: unknown;
  texto?: unknown;
}

export function normalizeInverterText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function inferInverterNetworkType(data: InverterNetworkData): InverterNetworkType {
  if (data.tipoRede === "monofasico" || data.tipoRede === "trifasico") {
    return data.tipoRede;
  }

  const connection = normalizeInverterText(`${data.ligacaoRede ?? ""} ${data.formaLigacaoRede ?? ""}`);
  if (/(?:^|\s)3(?:l|p|f)\s*\+\s*n\s*\+\s*pe(?:\s|$)|3l\+n\+pe|3p\+n\+pe/.test(connection)) {
    return "trifasico";
  }
  if (/(?:^|\s)(?:l|1p|1f)\s*\+\s*n\s*\+\s*pe(?:\s|$)|l\+n\+pe|1p\+n\+pe|1f\+n\+pe/.test(connection)) {
    return "monofasico";
  }

  const voltage = normalizeInverterText(
    `${data.tensaoAcNominal ?? ""} ${data.tensaoAcSaida ?? ""} ${data.faixaTensaoAc ?? ""} ${data.rangeTensaoAc ?? ""}`,
  );
  if (/\b(?:220\s*\/\s*380|230\s*\/\s*400|380\s*\/\s*400)\b|\b(?:380|400)\s*v\b/.test(voltage)) {
    return "trifasico";
  }
  if (/\b220\s*\/\s*230\b|\b230\s*v\b/.test(voltage)) {
    return "monofasico";
  }

  const text = normalizeInverterText(
    `${data.texto ?? ""} ${data.fabricante ?? ""} ${data.nome ?? ""} ${data.modelo ?? ""}`,
  );
  if (/three[\s-]*phase|trifas|sg0?5lp3|sg04lp3|lp3(?:\b|-)|(?:\b|-)p3(?:\b|-)/.test(text)) {
    return "trifasico";
  }
  if (/single[\s-]*phase|monofas|sg0?5lp1|lp1(?:\b|-)|eu-am2/.test(text)) {
    return "monofasico";
  }
  return "desconhecido";
}

export function normalizeInverterNetworkFields(data: InverterNetworkData) {
  const tipoRede = inferInverterNetworkType(data);
  const model = normalizeInverterText(`${data.nome ?? ""} ${data.modelo ?? ""}`);
  const isLp3 = /sg0?5lp3|lp3(?:\b|-)/.test(model);
  const isLp1 = /sg0?5lp1|lp1(?:\b|-)/.test(model);
  const voltage = String(data.tensaoAcNominal ?? data.tensaoAcSaida ?? "").trim();
  const voltageRange = String(data.faixaTensaoAc ?? data.rangeTensaoAc ?? "").trim();
  const connection = String(data.ligacaoRede ?? data.formaLigacaoRede ?? "").trim();
  return {
    tipoRede,
    tensaoAcNominal: voltage || (isLp3 ? "220/380 V, 230/400 V" : isLp1 ? "220/230 V" : ""),
    faixaTensaoAc: voltageRange || ((isLp3 || isLp1) ? "0.85Un-1.1Un" : ""),
    ligacaoRede: connection || (isLp3 ? "3L+N+PE" : isLp1 ? "L+N+PE" : ""),
  };
}
