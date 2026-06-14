import test from "node:test";
import assert from "node:assert/strict";

import {
  inferInverterNetworkType,
  normalizeInverterNetworkFields,
} from "./inverter-network";

test("SG05LP3 comparative models are normalized as three-phase", () => {
  for (const power of [14, 15, 16, 18, 20]) {
    const result = normalizeInverterNetworkFields({
      nome: `SUN-${power}K-SG05LP3-EU-SM2`,
    });
    assert.equal(result.tipoRede, "trifasico");
    assert.equal(result.ligacaoRede, "3L+N+PE");
    assert.match(result.tensaoAcNominal, /220\/380/);
    assert.equal(result.faixaTensaoAc, "0.85Un-1.1Un");
  }
});

test("SG05LP1 and L+N+PE are normalized as single-phase", () => {
  assert.equal(
    inferInverterNetworkType({ nome: "SUN-10K-SG05LP1-EU-AM2-P" }),
    "monofasico",
  );
  assert.equal(
    inferInverterNetworkType({ ligacaoRede: "L+N+PE", tensaoAcNominal: "220/230 V" }),
    "monofasico",
  );
});

test("explicit manual selection has priority and remains unchanged", () => {
  assert.equal(
    inferInverterNetworkType({
      tipoRede: "trifasico",
      nome: "SUN-10K-SG05LP1-EU-AM2-P",
      ligacaoRede: "L+N+PE",
    }),
    "trifasico",
  );
  assert.equal(
    inferInverterNetworkType({
      tipoRede: "monofasico",
      nome: "SUN-20K-SG05LP3-EU-SM2",
      ligacaoRede: "3L+N+PE",
    }),
    "monofasico",
  );
});

test("connection has priority over voltage and model inference", () => {
  assert.equal(
    inferInverterNetworkType({
      nome: "SUN-20K-SG05LP3-EU-SM2",
      tensaoAcNominal: "230/400 V",
      ligacaoRede: "L+N+PE",
    }),
    "monofasico",
  );
  assert.equal(
    inferInverterNetworkType({
      nome: "SUN-10K-SG05LP1-EU-AM2-P",
      tensaoAcNominal: "220/230 V",
      ligacaoRede: "3L+N+PE",
    }),
    "trifasico",
  );
});
