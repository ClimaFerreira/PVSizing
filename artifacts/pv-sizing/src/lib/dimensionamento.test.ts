import test from "node:test";
import assert from "node:assert/strict";

import { simulateAnual } from "./energy-simulation";
import { calculateFinancialStudy } from "./financial-calculation";
import {
  calcStringSizing,
  calcStringSizingManual,
  maxPaineisPerString,
  type InverterElec,
  type PanelElec,
} from "./string-sizing";
import { resolvePanelConfiguration } from "./wizard-system";

const panel: PanelElec = {
  potencia: 620,
  voc: 49.8,
  vmp: 41.8,
  isc: 16.08,
  imp: 14.84,
  coeficienteTemperaturaVoc: -0.24,
  noct: 45,
};

const hybrid2Mppt: InverterElec = {
  potenciaAc: 10,
  potenciaDcMax: 16,
  vdcMax: 510,
  mpptMin: 150,
  mpptMax: 425,
  corrMaxMppt: 20,
  correnteCurtoCircuitoMppt: 35,
  numMppt: 2,
  stringsPorMppt: 2,
};

test("12, 14 and 16 panels produce valid configurations on a two-MPPT hybrid inverter", () => {
  for (const panelCount of [12, 14, 16]) {
    const result = calcStringSizing(panel, hybrid2Mppt, panelCount);
    assert.equal(result.semSolucao, false, `${panelCount} panels should be valid`);
    assert.equal(result.config.totalPaineis, panelCount);
    assert.equal(result.config.mpptConfig.length, 2);
    assert.equal(result.config.numStrings, 2);
    assert.equal(result.alertas.some(alert => alert.tipo === "erro"), false);
  }
});

test("valid asymmetric strings are accepted when placed on separate MPPTs", () => {
  const result = calcStringSizingManual(panel, hybrid2Mppt, [[8], [6]], 14);
  assert.equal(result.semSolucao, false);
  assert.equal(result.config.totalPaineis, 14);
  assert.equal(result.alertas.some(alert => alert.tipo === "erro"), false);
});

test("operating current and short-circuit current use their own MPPT limits", () => {
  const inverterWithParallelInputs: InverterElec = {
    ...hybrid2Mppt,
    corrMaxMppt: 32,
    correnteCurtoCircuitoMppt: 40,
  };
  const result = calcStringSizingManual(panel, inverterWithParallelInputs, [[7, 7], []], 14);

  assert.equal(result.alertas.some(alert => alert.tipo === "erro"), false);
  assert.ok(result.alertas.some(alert => alert.mensagem.includes("Imp/Isc")));
});

test("minimum and maximum string lengths respect hot/cold MPPT voltage limits", () => {
  const maximum = maxPaineisPerString(panel, hybrid2Mppt);
  const minimumResult = calcStringSizingManual(panel, hybrid2Mppt, [[5], []], null);
  const maximumResult = calcStringSizingManual(panel, hybrid2Mppt, [[maximum], []], null);

  assert.equal(minimumResult.alertas.some(alert => alert.mensagem.includes("janela MPPT") && alert.tipo === "erro"), false);
  assert.equal(maximumResult.alertas.some(alert => alert.mensagem.includes("janela MPPT") && alert.tipo === "erro"), false);
  assert.equal(maximum, 9);
});

test("battery simulation increases self-consumption and reduces imports and exports", () => {
  const production = [500, 600, 800, 1000, 1200, 1300, 1400, 1300, 1000, 800, 600, 500];
  const consumption = Array(12).fill(800);
  const withoutBattery = simulateAnual(production, consumption, 40, 0);
  const withBattery = simulateAnual(production, consumption, 40, {
    capacidadeKwh: 10,
    dodPct: 80,
    eficienciaRoundTripPct: 90,
    potenciaCargaMaxKw: 5,
    potenciaDescargaMaxKw: 5,
  });

  assert.ok(withBattery.autoconsumoAnual > withoutBattery.autoconsumoAnual);
  assert.ok(withBattery.excessoAnual < withoutBattery.excessoAnual);
  assert.ok(withBattery.importacaoAnual < withoutBattery.importacaoAnual);
  assert.ok(withBattery.bateriaEntregueAnual > 0);
});

test("simple payback uses year-one savings and export revenue is explicit", () => {
  const withoutExport = calculateFinancialStudy({
    investimento: 9000,
    autoconsumoAnualKwh: 5754.49,
    excedenteAnualKwh: 0,
    precoKwh: 0.167,
    precoInjecao: 0.06,
  });
  const withExport = calculateFinancialStudy({
    investimento: 9000,
    autoconsumoAnualKwh: 5754.49,
    excedenteAnualKwh: 1500,
    precoKwh: 0.167,
    precoInjecao: 0.06,
  });

  assert.equal(withoutExport.paybackSimplesAnos, 9.4);
  assert.ok((withExport.paybackSimplesAnos ?? 99) < (withoutExport.paybackSimplesAnos ?? 99));
  assert.equal(withExport.receitaExcedenteAno1, 90);
});

test("explicit panel count remains the single source across wizard steps", () => {
  const selected = resolvePanelConfiguration({
    targetPowerKwp: 7.5,
    panelPowerWp: 620,
    explicitPanelCount: 14,
  });
  const automatic = resolvePanelConfiguration({
    targetPowerKwp: 7.5,
    panelPowerWp: 620,
  });

  assert.deepEqual(selected, { panelCount: 14, installedPowerKwp: 8.68 });
  assert.deepEqual(automatic, { panelCount: 13, installedPowerKwp: 8.06 });
});
