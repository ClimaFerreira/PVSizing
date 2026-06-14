export interface PanelConfigurationInput {
  targetPowerKwp: number;
  panelPowerWp: number;
  explicitPanelCount?: number | null;
}

export interface PanelConfiguration {
  panelCount: number;
  installedPowerKwp: number;
}

export function resolvePanelConfiguration(input: PanelConfigurationInput): PanelConfiguration {
  const panelPowerWp = Math.max(1, input.panelPowerWp);
  const targetPowerKwp = Math.max(0, input.targetPowerKwp);
  const explicit = input.explicitPanelCount;
  const panelCount =
    explicit != null && Number.isFinite(explicit) && explicit > 0
      ? Math.max(1, Math.round(explicit))
      : Math.max(1, Math.ceil((targetPowerKwp * 1000) / panelPowerWp));

  return {
    panelCount,
    installedPowerKwp: Math.round(panelCount * panelPowerWp) / 1000,
  };
}
