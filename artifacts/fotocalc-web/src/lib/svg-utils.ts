import { SolarResult } from "@/contexts/SolarContext";
import { RoiResult } from "@/contexts/RoiContext";

export function buildCrossSectionSvg(result: SolarResult): string {
  const W = 640;
  const H = 320;

  const h = result.panelHeight;
  const panelProjDepth = result.panelProjectedDepth; // cos(β)*h
  const gap = result.gap;
  const panelRad = result.panelAngle * Math.PI / 180;
  const altDeg = result.altitudeAngle;
  const altRad = altDeg * Math.PI / 180;
  const panelProjH = Math.sin(panelRad) * h; // vertical height of panel

  // Layout convention: view from WEST → South=LEFT, North=RIGHT
  // South-facing panels: base (south edge) to the LEFT, top (north edge) to the RIGHT
  // Front row (south/left), back row (north/right)
  // Sun is to the upper-LEFT (south direction)

  const paddingRight = 55; // north (right) margin
  const paddingBottom = 45;
  const sunR = 20;
  const sunMarginLeft = 90; // reserve left of front panel base for sun
  const baseline = H - paddingBottom;

  // Total panel span: panelProjDepth (front) + gap + panelProjDepth (back) = rowSpacing + panelProjDepth
  const totalSpan = result.rowSpacing + panelProjDepth;
  const availW = W - paddingRight - sunMarginLeft;
  const scale = Math.min(availW / totalSpan, (baseline - 85) / (panelProjH * 1.2));

  // Front row (SOUTH / LEFT): base at leftmost (south), top toward right (north)
  const pfBaseX = sunMarginLeft;
  const pfTopX = pfBaseX + panelProjDepth * scale;
  const pfTopY = baseline - panelProjH * scale;

  // Shadow tip = back row's south base (where shadow just reaches, = pfTopX + gap)
  const shadowTipX = pfTopX + gap * scale;

  // Back row (NORTH / RIGHT): base at shadowTipX, top further right
  const pbBaseX = shadowTipX;
  const pbTopX = pbBaseX + panelProjDepth * scale;
  const pbTopY = baseline - panelProjH * scale;

  // Sun direction from shadow tip: upper-LEFT at altitude angle (south is left)
  const sndx = -Math.cos(altRad); // leftward = south
  const sndy = -Math.sin(altRad); // upward

  // Place sun to the left of pfBaseX for visual clarity
  const targetSunX = Math.max(sunR + 8, pfBaseX - 50);
  const distByX = (shadowTipX - targetSunX) / Math.cos(altRad);
  const distByY = (baseline - sunR - 8) / Math.sin(altRad);
  const sunDist = Math.min(distByX, distByY, 500);
  const sunX = shadowTipX + sunDist * sndx;
  const sunY = baseline + sunDist * sndy;

  // Sun rays
  const numRays = 8;
  let sunRaysSvg = "";
  for (let i = 0; i < numRays; i++) {
    const ang = (i * 360 / numRays) * Math.PI / 180;
    const x1 = sunX + (sunR + 4) * Math.cos(ang);
    const y1 = sunY + (sunR + 4) * Math.sin(ang);
    const x2 = sunX + (sunR + 12) * Math.cos(ang);
    const y2 = sunY + (sunR + 12) * Math.sin(ang);
    sunRaysSvg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#F5A623" stroke-width="2" stroke-linecap="round"/>`;
  }

  // Altitude angle arc at shadow tip: from horizontal-left toward sun (upper-left)
  const arcR = 42;
  const arcEndX = shadowTipX + arcR * sndx; // left of shadowTip
  const arcEndY = baseline + arcR * sndy;   // above baseline

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#BAE6FD"/>
          <stop offset="100%" stop-color="#EFF6FF"/>
        </linearGradient>
      </defs>

      <!-- Sky -->
      <rect width="${W}" height="${baseline}" fill="url(#skyGrad)"/>
      <!-- Ground -->
      <rect x="0" y="${baseline}" width="${W}" height="${H - baseline}" fill="#E2E8F0"/>
      <line x1="0" y1="${baseline}" x2="${W}" y2="${baseline}" stroke="#94A3B8" stroke-width="2"/>

      <!-- Direction labels -->
      <text x="10" y="${baseline - 6}" font-size="11" fill="#B45309" font-family="system-ui" font-weight="bold">← Sul</text>
      <text x="${W - 10}" y="${baseline - 6}" text-anchor="end" font-size="11" fill="#64748B" font-family="system-ui" font-style="italic">Norte →</text>

      <!-- Sun rays -->
      ${sunRaysSvg}
      <!-- Sun body -->
      <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${sunR}" fill="#FDE68A" stroke="#F5A623" stroke-width="2.5"/>
      <text x="${sunX.toFixed(1)}" y="${(sunY + 4.5).toFixed(1)}" text-anchor="middle" font-size="9" fill="#92400E" font-family="system-ui" font-weight="bold">Sol</text>

      <!-- Ray: from sun through front-panel top to shadow tip -->
      <line x1="${(sunX - sunR * sndx).toFixed(1)}" y1="${(sunY - sunR * sndy).toFixed(1)}"
            x2="${shadowTipX}" y2="${baseline}"
            stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="6,3" opacity="0.85"/>

      <!-- Altitude angle arc at shadow tip (opening toward sun = upper-left) -->
      <path d="M ${(shadowTipX - arcR).toFixed(1)} ${baseline} A ${arcR} ${arcR} 0 0 0 ${arcEndX.toFixed(1)} ${arcEndY.toFixed(1)}"
            fill="none" stroke="#1E88E5" stroke-width="1.5"/>
      <text x="${(shadowTipX - arcR - 7).toFixed(1)}" y="${(baseline - 12).toFixed(1)}"
            text-anchor="end" font-size="12" fill="#1E88E5" font-family="system-ui" font-weight="bold">${altDeg.toFixed(1)}°</text>

      <!-- Front row (SOUTH/LEFT): base LEFT, top RIGHT — south-facing ✓ -->
      <line x1="${pfBaseX.toFixed(1)}" y1="${baseline}"
            x2="${pfTopX.toFixed(1)}" y2="${pfTopY.toFixed(1)}"
            stroke="#0D2B45" stroke-width="7" stroke-linecap="round"/>

      <!-- Back row (NORTH/RIGHT): base LEFT, top RIGHT — south-facing ✓ -->
      <line x1="${pbBaseX.toFixed(1)}" y1="${baseline}"
            x2="${pbTopX.toFixed(1)}" y2="${pbTopY.toFixed(1)}"
            stroke="#0D2B45" stroke-width="7" stroke-linecap="round"/>

      <!-- Panel inclination angle arc at front panel base (opening rightward) -->
      <path d="M ${(pfBaseX + 28).toFixed(1)} ${baseline} A 28 28 0 0 1 ${(pfBaseX + 28 * Math.cos(panelRad)).toFixed(1)} ${(baseline - 28 * Math.sin(panelRad)).toFixed(1)}"
            fill="none" stroke="#94A3B8" stroke-width="1.2"/>
      <text x="${(pfBaseX + 36).toFixed(1)}" y="${(baseline - 12).toFixed(1)}"
            font-size="10" fill="#64748B" font-family="system-ui">${result.panelAngle}°</text>

      <!-- Gap highlight on ground (from front-row top to back-row base) -->
      <line x1="${pfTopX.toFixed(1)}" y1="${baseline}"
            x2="${shadowTipX.toFixed(1)}" y2="${baseline}"
            stroke="#EF4444" stroke-width="4" stroke-linecap="round"/>
      <text x="${((pfTopX + shadowTipX) / 2).toFixed(1)}" y="${(baseline - 11).toFixed(1)}"
            text-anchor="middle" font-size="12" fill="#EF4444" font-family="system-ui" font-weight="bold">Gap: ${gap.toFixed(2)}m</text>

      <!-- Front panel ground projection -->
      <line x1="${pfBaseX.toFixed(1)}" y1="${baseline + 14}" x2="${pfTopX.toFixed(1)}" y2="${baseline + 14}"
            stroke="#94A3B8" stroke-width="1" stroke-dasharray="3,2"/>
      <line x1="${pfBaseX.toFixed(1)}" y1="${baseline + 10}" x2="${pfBaseX.toFixed(1)}" y2="${baseline + 18}" stroke="#94A3B8" stroke-width="1"/>
      <line x1="${pfTopX.toFixed(1)}" y1="${baseline + 10}" x2="${pfTopX.toFixed(1)}" y2="${baseline + 18}" stroke="#94A3B8" stroke-width="1"/>
      <text x="${((pfBaseX + pfTopX) / 2).toFixed(1)}" y="${baseline + 28}"
            text-anchor="middle" font-size="10" fill="#64748B" font-family="system-ui">Proj. ${panelProjDepth.toFixed(2)}m</text>

      <!-- Row spacing d: from front-row base to back-row base -->
      <line x1="${pfBaseX.toFixed(1)}" y1="${(pfTopY - 10).toFixed(1)}"
            x2="${pbBaseX.toFixed(1)}" y2="${(pfTopY - 10).toFixed(1)}"
            stroke="#1E88E5" stroke-width="1" stroke-dasharray="3,2"/>
      <text x="${((pfBaseX + pbBaseX) / 2).toFixed(1)}" y="${(pfTopY - 15).toFixed(1)}"
            text-anchor="middle" font-size="10" fill="#1E88E5" font-family="system-ui">d = ${result.rowSpacing.toFixed(2)}m</text>
    </svg>
  `;
}

export function buildLayoutSvg(result: SolarResult, rows: number, cols: number): string {
  const W = 400;
  const H = 400;

  const w = result.panelWidth;
  const rowSpacing = result.rowSpacing;
  const gap = result.gap;
  const proj = result.panelProjectedDepth;

  const totalW = cols * w;
  const totalH = proj + (rows - 1) * rowSpacing;

  const paddingX = 40;
  const paddingY = 40;

  const scale = Math.min((W - paddingX * 2) / totalW, (H - paddingY * 2) / totalH);

  const startX = (W - totalW * scale) / 2;
  const startY = (H - totalH * scale) / 2;

  let rects = "";
  let gaps = "";

  for (let r = 0; r < rows; r++) {
    const y = startY + r * rowSpacing * scale;
    for (let c = 0; c < cols; c++) {
      const x = startX + c * w * scale;
      rects += `<rect x="${x}" y="${y}" width="${w * scale - 2}" height="${proj * scale}" fill="#1E88E5" stroke="#0D2B45" stroke-width="1" rx="2" />`;
    }
    if (r < rows - 1) {
      gaps += `<rect x="${startX}" y="${y + proj * scale}" width="${totalW * scale}" height="${gap * scale}" fill="rgba(239, 68, 68, 0.2)" />`;
    }
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#F0F6FB" />

      <!-- N / S Labels -->
      <text x="${W/2}" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#0D2B45" font-family="system-ui">N</text>
      <text x="${W/2}" y="${H - 10}" text-anchor="middle" font-size="14" font-weight="bold" fill="#0D2B45" font-family="system-ui">S</text>

      ${gaps}
      ${rects}

      <!-- Dimension lines -->
      <line x1="${startX - 10}" y1="${startY}" x2="${startX - 10}" y2="${startY + totalH * scale}" stroke="#94A3B8" stroke-width="1" />
      <text x="${startX - 15}" y="${H/2}" text-anchor="middle" transform="rotate(-90, ${startX - 15}, ${H/2})" font-size="12" fill="#64748B" font-family="system-ui">${result.totalLength.toFixed(2)}m</text>

      <line x1="${startX}" y1="${startY - 10}" x2="${startX + totalW * scale}" y2="${startY - 10}" stroke="#94A3B8" stroke-width="1" />
      <text x="${W/2}" y="${startY - 15}" text-anchor="middle" font-size="12" fill="#64748B" font-family="system-ui">${result.totalWidth.toFixed(2)}m</text>
    </svg>
  `;
}

export function buildCoplanarLayoutSvg(panelH: number, panelW: number, rows: number, cols: number): string {
  const W = 400;
  const H = 400;
  const gapRow = 0.02;
  const gapCol = 0.05;

  const totalW = cols * panelW + (cols - 1) * gapCol;
  const totalH = rows * panelH + (rows - 1) * gapRow;

  const paddingX = 40;
  const paddingY = 40;
  const scale = Math.min((W - paddingX * 2) / totalW, (H - paddingY * 2) / totalH);

  const startX = (W - totalW * scale) / 2;
  const startY = (H - totalH * scale) / 2;

  let rects = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + (c * (panelW + gapCol)) * scale;
      const y = startY + (r * (panelH + gapRow)) * scale;
      rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(panelW * scale - 1).toFixed(1)}" height="${(panelH * scale - 1).toFixed(1)}" fill="#3B82F6" stroke="#0D2B45" stroke-width="1" rx="2"/>`;
    }
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#F0F6FB"/>
      <text x="${W/2}" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#0D2B45" font-family="system-ui">N</text>
      <text x="${W/2}" y="${H-10}" text-anchor="middle" font-size="14" font-weight="bold" fill="#0D2B45" font-family="system-ui">S</text>
      ${rects}
      <line x1="${(startX-10).toFixed(1)}" y1="${startY.toFixed(1)}" x2="${(startX-10).toFixed(1)}" y2="${(startY+totalH*scale).toFixed(1)}" stroke="#94A3B8" stroke-width="1"/>
      <text x="${(startX-15).toFixed(1)}" y="${(H/2).toFixed(1)}" text-anchor="middle" transform="rotate(-90,${(startX-15).toFixed(1)},${(H/2).toFixed(1)})" font-size="12" fill="#64748B" font-family="system-ui">${totalH.toFixed(2)}m</text>
      <line x1="${startX.toFixed(1)}" y1="${(startY-10).toFixed(1)}" x2="${(startX+totalW*scale).toFixed(1)}" y2="${(startY-10).toFixed(1)}" stroke="#94A3B8" stroke-width="1"/>
      <text x="${(W/2).toFixed(1)}" y="${(startY-15).toFixed(1)}" text-anchor="middle" font-size="12" fill="#64748B" font-family="system-ui">${totalW.toFixed(2)}m</text>
    </svg>
  `;
}

export function buildMonthlyBarChartSvg(monthlyKwh: number[]): string {
  const W = 600;
  const H = 250;
  const paddingX = 40;
  const paddingY = 30;
  const maxVal = Math.max(...monthlyKwh) * 1.1;
  const barWidth = (W - paddingX * 2) / 12 * 0.6;
  const spacing = (W - paddingX * 2) / 12;

  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  let bars = "";
  monthlyKwh.forEach((val, i) => {
    const h = (val / maxVal) * (H - paddingY * 2);
    const x = paddingX + i * spacing + (spacing - barWidth) / 2;
    const y = H - paddingY - h;
    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="#1E88E5" rx="2" />`;
    bars += `<text x="${x + barWidth/2}" y="${H - paddingY + 15}" text-anchor="middle" font-size="10" fill="#64748B" font-family="system-ui">${labels[i]}</text>`;
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Grid -->
      <line x1="${paddingX}" y1="${H - paddingY}" x2="${W - paddingX}" y2="${H - paddingY}" stroke="#E2E8F0" stroke-width="2" />
      <line x1="${paddingX}" y1="${paddingY}" x2="${W - paddingX}" y2="${paddingY}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="4,4" />
      <text x="${paddingX - 5}" y="${paddingY + 4}" text-anchor="end" font-size="10" fill="#64748B" font-family="system-ui">${Math.round(maxVal)} kWh</text>

      ${bars}
    </svg>
  `;
}

export function buildRoiLineChartSvg(cumulativeNet: number[]): string {
  const W = 600;
  const H = 250;
  const paddingX = 50;
  const paddingY = 30;

  const minVal = Math.min(...cumulativeNet, 0);
  const maxVal = Math.max(...cumulativeNet);
  const range = maxVal - minVal;

  const zeroY = H - paddingY - ((0 - minVal) / range) * (H - paddingY * 2);
  const stepX = (W - paddingX * 2) / 24;

  let d = `M ${paddingX} ${H - paddingY - ((cumulativeNet[0] - minVal) / range) * (H - paddingY * 2)}`;
  let points = "";

  cumulativeNet.forEach((val, i) => {
    const x = paddingX + i * stepX;
    const y = H - paddingY - ((val - minVal) / range) * (H - paddingY * 2);
    if (i > 0) d += ` L ${x} ${y}`;
    if (i % 5 === 0 || i === 24) {
      points += `<circle cx="${x}" cy="${y}" r="3" fill="#0D2B45" />`;
      points += `<text x="${x}" y="${H - paddingY + 20}" text-anchor="middle" font-size="10" fill="#64748B" font-family="system-ui">Ano ${i+1}</text>`;
    }
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Zero Line -->
      <line x1="${paddingX}" y1="${zeroY}" x2="${W - paddingX}" y2="${zeroY}" stroke="#EF4444" stroke-width="1" stroke-dasharray="4,4" />
      <text x="${paddingX - 5}" y="${zeroY + 4}" text-anchor="end" font-size="10" fill="#EF4444" font-family="system-ui">0 €</text>

      <!-- Max Line -->
      <text x="${paddingX - 5}" y="${paddingY + 4}" text-anchor="end" font-size="10" fill="#10B981" font-family="system-ui">${Math.round(maxVal)} €</text>

      <!-- Min Line -->
      <text x="${paddingX - 5}" y="${H - paddingY + 4}" text-anchor="end" font-size="10" fill="#EF4444" font-family="system-ui">${Math.round(minVal)} €</text>

      <!-- Path -->
      <path d="${d}" fill="none" stroke="#0D2B45" stroke-width="3" stroke-linejoin="round" />
      ${points}
    </svg>
  `;
}
