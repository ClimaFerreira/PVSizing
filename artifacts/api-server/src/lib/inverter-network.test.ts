import test from "node:test";
import assert from "node:assert/strict";

import {
  inferInverterNetworkType,
  inverterNetworkColumnsForWrite,
  normalizeImportedInverterNetwork,
} from "./inverter-network";

test("API detects LP3 and LP1 without using inverter power", () => {
  assert.equal(inferInverterNetworkType({ nome: "SUN-20K-SG05LP3-EU-SM2" }), "trifasico");
  assert.equal(inferInverterNetworkType({ nome: "SUN-10K-SG05LP1-EU-AM2-P" }), "monofasico");
});

test("batch normalization copies known AC fields to every SG05LP3 model", () => {
  const models = [14, 15, 16, 18, 20].map(power =>
    normalizeImportedInverterNetwork({ nome: `SUN-${power}K-SG05LP3-EU-SM2` }),
  );
  assert.ok(models.every(model => model.tipoRede === "trifasico"));
  assert.ok(models.every(model => model.ligacaoRede === "3L+N+PE"));
  assert.ok(models.every(model => model.tensaoAcNominal.includes("230/400")));
});

test("database write values preserve the exact manual network selection", () => {
  assert.deepEqual(
    inverterNetworkColumnsForWrite({
      tipoRede: "desconhecido",
      nome: "SUN-20K-SG05LP3-EU-SM2",
      tensaoAcNominal: " 230/400 V ",
      faixaTensaoAc: " 0.85Un-1.1Un ",
      ligacaoRede: " 3L+N+PE ",
    }),
    {
      tipoRede: "desconhecido",
      tensaoAcNominal: "230/400 V",
      faixaTensaoAc: "0.85Un-1.1Un",
      ligacaoRede: "3L+N+PE",
    },
  );
});
