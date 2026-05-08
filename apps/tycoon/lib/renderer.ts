import { TILE_SIZE, GRID_W, GRID_H, BUILDING_DEFS, CITY_WIDTH } from './constants';
import type { Game, BuildMode } from './game';
import type { PlacedBuilding, Tile, InfraType, BuildingType } from './types';

// ── Infra neighbor mask ─────────────────────────────────────────────────────
// bit 0=N, 1=E, 2=S, 3=W
function infraMask(grid: Tile[][], tx: number, ty: number, infra: InfraType): number {
  let m = 0;
  if (ty > 0 && grid[ty - 1][tx].infra === infra) m |= 1;
  if (tx < GRID_W - 1 && grid[ty][tx + 1].infra === infra) m |= 2;
  if (ty < GRID_H - 1 && grid[ty + 1][tx].infra === infra) m |= 4;
  if (tx > 0 && grid[ty][tx - 1].infra === infra) m |= 8;
  return m;
}

// ── Road drawing ────────────────────────────────────────────────────────────
function drawRoad(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number, mask: number) {
  const half = ts * 0.35; // half road width
  const cx = sx + ts / 2, cy = sy + ts / 2;

  ctx.fillStyle = '#2d2d2d';
  // Center square
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  // Arms
  if (mask & 1) ctx.fillRect(cx - half, sy, half * 2, cy - half - sy);        // N
  if (mask & 2) ctx.fillRect(cx + half, cy - half, sx + ts - cx - half, half * 2); // E
  if (mask & 4) ctx.fillRect(cx - half, cy + half, half * 2, sy + ts - cy - half); // S
  if (mask & 8) ctx.fillRect(sx, cy - half, cx - half - sx, half * 2);        // W

  // Center dashes
  if (ts < 20) return;
  ctx.fillStyle = '#fbbf24';
  const dw = Math.max(1, ts * 0.03);
  const dh = ts * 0.12;
  const gap = ts * 0.06;
  if ((mask & 5) === 5 || (mask & 5) === 0) { // NS or isolated
    for (let offset = -half + dh / 2; offset < half; offset += dh + gap) {
      ctx.fillRect(cx - dw / 2, cy + offset - dh / 2, dw, dh);
    }
  }
  if ((mask & 10) === 10 || (mask & 10) === 0) { // EW
    for (let offset = -half + dh / 2; offset < half; offset += dh + gap) {
      ctx.fillRect(cx + offset - dh / 2, cy - dw / 2, dh, dw);
    }
  }
}

// ── Railway drawing ─────────────────────────────────────────────────────────
function drawRailway(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number, mask: number) {
  const half = ts * 0.3;
  const cx = sx + ts / 2, cy = sy + ts / 2;
  const railOff = half * 0.55;

  // Brown ballast
  ctx.fillStyle = '#5b3a1a';
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  if (mask & 1) ctx.fillRect(cx - half, sy, half * 2, cy - half - sy);
  if (mask & 2) ctx.fillRect(cx + half, cy - half, sx + ts - cx - half, half * 2);
  if (mask & 4) ctx.fillRect(cx - half, cy + half, half * 2, sy + ts - cy - half);
  if (mask & 8) ctx.fillRect(sx, cy - half, cx - half - sx, half * 2);

  if (ts < 18) return;

  const rw = Math.max(1, ts * 0.04);
  ctx.fillStyle = '#94a3b8';

  // Vertical rails (N-S arm or isolated)
  const hasNS = (mask & 1) || (mask & 4);
  const hasEW = (mask & 2) || (mask & 8);

  if (hasNS || (!hasNS && !hasEW)) {
    const yt = (mask & 1) ? sy : cy - half;
    const yb = (mask & 4) ? sy + ts : cy + half;
    ctx.fillRect(cx - railOff - rw / 2, yt, rw, yb - yt);
    ctx.fillRect(cx + railOff - rw / 2, yt, rw, yb - yt);
    // Ties
    ctx.fillStyle = '#78350f';
    const tieH = Math.max(1, ts * 0.05);
    const step = ts * 0.15;
    for (let yo = yt + step / 2; yo < yb; yo += step) {
      ctx.fillRect(cx - railOff - rw, yo, railOff * 2 + rw * 2, tieH);
    }
    ctx.fillStyle = '#94a3b8';
  }
  if (hasEW) {
    const xl = (mask & 8) ? sx : cx - half;
    const xr = (mask & 2) ? sx + ts : cx + half;
    ctx.fillRect(xl, cy - railOff - rw / 2, xr - xl, rw);
    ctx.fillRect(xl, cy + railOff - rw / 2, xr - xl, rw);
    ctx.fillStyle = '#78350f';
    const tieW = Math.max(1, ts * 0.05);
    const step = ts * 0.15;
    for (let xo = xl + step / 2; xo < xr; xo += step) {
      ctx.fillRect(xo, cy - railOff - rw, tieW, railOff * 2 + rw * 2);
    }
  }
}

// ── Power line drawing ──────────────────────────────────────────────────────
function drawPowerLine(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number, mask: number) {
  const cx = sx + ts / 2, cy = sy + ts / 2;
  const poleW = Math.max(1, ts * 0.07);
  const wireY1 = cy - ts * 0.15;
  const wireY2 = cy + ts * 0.05;

  // Pole
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - poleW / 2, sy + ts * 0.15, poleW, ts * 0.7);

  if (ts < 18) return;

  // Crossbar
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - ts * 0.22, wireY1 - ts * 0.025, ts * 0.44, ts * 0.05);

  // Wires
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = Math.max(1, ts * 0.025);
  ctx.beginPath();
  if (mask & 8) { ctx.moveTo(sx, wireY1); ctx.lineTo(cx - ts * 0.22, wireY1); }
  if (mask & 2) { ctx.moveTo(cx + ts * 0.22, wireY1); ctx.lineTo(sx + ts, wireY1); }
  if (mask & 1) { ctx.moveTo(cx, wireY1); ctx.lineTo(cx, sy); }
  if (mask & 4) { ctx.moveTo(cx, wireY2 + ts * 0.05); ctx.lineTo(cx, sy + ts); }
  ctx.stroke();

  // Insulators (dots)
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(cx - ts * 0.2, wireY1, ts * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + ts * 0.2, wireY1, ts * 0.04, 0, Math.PI * 2); ctx.fill();
}

// ── Building drawing helpers ────────────────────────────────────────────────
function windows(
  ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number,
  cols: number, rows: number, winColor: string, time = 0,
) {
  const cw = w / cols, rh = h / rows;
  const ww = cw * 0.5, wh = rh * 0.5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.sin(time * 0.3 + r * 3 + c * 7) > 0.1;
      ctx.fillStyle = lit ? winColor : 'rgba(0,0,0,0.4)';
      ctx.fillRect(sx + c * cw + (cw - ww) / 2, sy + r * rh + (rh - wh) / 2, ww, wh);
    }
  }
}

function triangleRoof(
  ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(sx, sy + h);
  ctx.lineTo(sx + w / 2, sy);
  ctx.lineTo(sx + w, sy + h);
  ctx.closePath();
  ctx.fill();
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ── Building shape renderers ────────────────────────────────────────────────
function drawCityHouse(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  const wallH = h * 0.58;
  const wallY = sy + h - wallH;
  // Roof
  triangleRoof(ctx, sx + w * 0.05, sy, w * 0.9, h * 0.48, '#7c3c1a');
  // Walls
  rect(ctx, sx + w * 0.08, wallY, w * 0.84, wallH, '#d4a06a');
  if (ts < 24) return;
  // Windows
  ctx.fillStyle = '#87ceeb';
  const ww = w * 0.18, wh = h * 0.14;
  rect(ctx, sx + w * 0.18, wallY + h * 0.1, ww, wh, '#87ceeb');
  rect(ctx, sx + w * 0.64, wallY + h * 0.1, ww, wh, '#87ceeb');
  // Door
  rect(ctx, sx + w * 0.38, wallY + wallH - h * 0.24, w * 0.22, h * 0.24, '#6b3a1a');
}

function drawTownHall(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  // Main body
  rect(ctx, sx + w * 0.05, sy + h * 0.25, w * 0.9, h * 0.75, '#9ca3af');
  // Pediment / roof
  triangleRoof(ctx, sx + w * 0.05, sy, w * 0.9, h * 0.3, '#6b7280');
  if (ts < 32) return;
  // Columns
  const nCols = 4, colW = w * 0.07;
  for (let i = 0; i < nCols; i++) {
    const cx2 = sx + w * 0.15 + i * (w * 0.7 / (nCols - 1));
    rect(ctx, cx2 - colW / 2, sy + h * 0.24, colW, h * 0.76, '#e5e7eb');
  }
  // Windows
  windows(ctx, sx + w * 0.1, sy + h * 0.4, w * 0.8, h * 0.45, 3, 2, '#bfdbfe', time);
  // Flag
  if (ts > 48) {
    rect(ctx, sx + w / 2, sy, w * 0.02, h * 0.2, '#374151');
    rect(ctx, sx + w / 2, sy, w * 0.12, h * 0.08, '#ef4444');
  }
}

function drawCityMarket(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  rect(ctx, sx + w * 0.03, sy + h * 0.2, w * 0.94, h * 0.8, '#c2855c');
  // Awning
  const strips = 5;
  for (let i = 0; i < strips; i++) {
    const c = i % 2 === 0 ? '#ef4444' : '#fef3c7';
    rect(ctx, sx + i * (w / strips), sy + h * 0.18, w / strips, h * 0.1, c);
  }
  if (ts < 28) return;
  windows(ctx, sx + w * 0.1, sy + h * 0.35, w * 0.8, h * 0.45, 2, 2, '#fde68a', time);
  // Sign
  rect(ctx, sx + w * 0.2, sy + h * 0.12, w * 0.6, h * 0.07, '#fef3c7');
}

function drawStation(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number, isCity: boolean) {
  const bodyColor = isCity ? '#4b5563' : '#374151';
  // Platform base
  rect(ctx, sx + w * 0.02, sy + h * 0.6, w * 0.96, h * 0.4, '#94a3b8');
  // Building body
  rect(ctx, sx + w * 0.1, sy + h * 0.15, w * 0.8, h * 0.5, bodyColor);
  // Roof arch suggestion
  ctx.fillStyle = isCity ? '#374151' : '#1f2937';
  ctx.beginPath();
  ctx.ellipse(sx + w / 2, sy + h * 0.2, w * 0.4, h * 0.12, 0, Math.PI, 0);
  ctx.fill();
  if (ts < 28) return;
  // Arched windows
  ctx.fillStyle = '#bfdbfe';
  ctx.beginPath();
  ctx.ellipse(sx + w / 2, sy + h * 0.38, w * 0.15, h * 0.12, 0, Math.PI, 0, true);
  ctx.rect(sx + w / 2 - w * 0.15, sy + h * 0.38, w * 0.3, h * 0.08);
  ctx.fill();
  // Clock face
  if (ts > 48) {
    ctx.fillStyle = '#f9fafb';
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h * 0.18, ts * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = Math.max(1, ts * 0.015);
    ctx.beginPath();
    ctx.moveTo(sx + w / 2, sy + h * 0.18);
    ctx.lineTo(sx + w / 2 + ts * 0.04 * Math.cos(time * 0.5), sy + h * 0.18 + ts * 0.04 * Math.sin(time * 0.5));
    ctx.stroke();
  }
  // Train indicator
  rect(ctx, sx + w * 0.15, sy + h * 0.62, w * 0.7, h * 0.08, '#6b7280');
}

function drawCityPark(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  rect(ctx, sx, sy, w, h, '#16a34a');
  if (ts < 20) return;
  // Trees
  const trees = [[0.25, 0.3], [0.7, 0.25], [0.45, 0.6], [0.15, 0.7], [0.75, 0.65]];
  for (const [tx2, ty2] of trees) {
    const tx3 = sx + w * tx2, ty3 = sy + h * ty2;
    const r = Math.min(w, h) * 0.1;
    rect(ctx, tx3 - r * 0.15, ty3, r * 0.3, h * 0.15, '#92400e');
    ctx.fillStyle = `hsl(${130 + Math.floor(tx2 * 30)}, 55%, ${30 + Math.floor(ty2 * 15)}%)`;
    ctx.beginPath();
    ctx.arc(tx3, ty3 - r * 0.5, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Path
  ctx.fillStyle = '#d4b896';
  ctx.fillRect(sx + w * 0.45, sy + h * 0.05, w * 0.1, h * 0.9);
  ctx.fillRect(sx + w * 0.05, sy + h * 0.45, w * 0.9, h * 0.1);
}

function drawHQ(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  // Base plinth
  rect(ctx, sx + w * 0.05, sy + h * 0.7, w * 0.9, h * 0.3, '#1e3a5f');
  // Tower
  const tw = w * 0.5, tx = sx + (w - tw) / 2;
  rect(ctx, tx, sy, tw, h * 0.72, '#1e40af');
  if (ts < 28) return;
  // Glass windows
  windows(ctx, tx + tw * 0.08, sy + h * 0.05, tw * 0.84, h * 0.65, 3, 5, '#bfdbfe', time);
  // Entrance
  rect(ctx, sx + w * 0.35, sy + h * 0.7, w * 0.3, h * 0.3, '#1d4ed8');
  // Flag/antenna
  if (ts > 48) {
    rect(ctx, tx + tw / 2 - ts * 0.01, sy - ts * 0.1, ts * 0.02, ts * 0.12, '#94a3b8');
    rect(ctx, tx + tw / 2, sy - ts * 0.08, ts * 0.08, ts * 0.06, '#ef4444');
  }
}

function drawPowerPlant(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  // Main building
  rect(ctx, sx + w * 0.05, sy + h * 0.35, w * 0.9, h * 0.65, '#78350f');
  // Two cooling towers
  const tw = w * 0.38;
  for (const ox of [w * 0.08, w * 0.54]) {
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.moveTo(sx + ox, sy + h * 0.35);
    ctx.lineTo(sx + ox + tw * 0.3, sy);
    ctx.lineTo(sx + ox + tw * 0.7, sy);
    ctx.lineTo(sx + ox + tw, sy + h * 0.35);
    ctx.closePath();
    ctx.fill();
    // Tower opening
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.ellipse(sx + ox + tw / 2, sy + ts * 0.03, tw * 0.28, ts * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (ts < 28) return;
  // Steam
  if (time > 0) {
    for (let i = 0; i < 3; i++) {
      const phase = (time * 0.8 + i * 0.4) % 1;
      const alpha = (1 - phase) * 0.5;
      const r = tw * 0.15 + phase * tw * 0.3;
      ctx.fillStyle = `rgba(229,231,235,${alpha})`;
      ctx.beginPath();
      ctx.arc(sx + w * 0.27, sy - phase * h * 0.2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx + w * 0.73, sy - phase * h * 0.2 + ts * 0.03, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  windows(ctx, sx + w * 0.1, sy + h * 0.42, w * 0.8, h * 0.4, 3, 2, '#fef3c7', time);
}

function drawOffice(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  rect(ctx, sx + w * 0.05, sy + h * 0.05, w * 0.9, h * 0.95, '#164e63');
  if (ts < 22) return;
  windows(ctx, sx + w * 0.12, sy + h * 0.1, w * 0.76, h * 0.75, 2, 3, '#67e8f9', time);
  // Flat roof AC
  rect(ctx, sx + w * 0.25, sy, w * 0.5, h * 0.06, '#0e7490');
  rect(ctx, sx + w * 0.4, sy + h * 0.85, w * 0.2, h * 0.12, '#0c4a6e');
}

function drawDataCenter(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  // Low building
  rect(ctx, sx + w * 0.02, sy + h * 0.15, w * 0.96, h * 0.85, '#1e3a8a');
  // Roof AC units
  rect(ctx, sx + w * 0.05, sy + h * 0.07, w * 0.88, h * 0.1, '#1e40af');
  if (ts < 28) return;
  // Server rack rows
  const rows2 = 4, rowH = h * 0.15;
  for (let r = 0; r < rows2; r++) {
    const ry = sy + h * 0.2 + r * (rowH + h * 0.03);
    rect(ctx, sx + w * 0.06, ry, w * 0.88, rowH, '#172554');
    // Blinking lights
    for (let j = 0; j < 6; j++) {
      const blink = Math.sin(time * 2 + r * 5 + j * 1.3) > 0.6;
      ctx.fillStyle = blink ? '#22c55e' : '#15803d';
      ctx.fillRect(sx + w * 0.1 + j * w * 0.13, ry + rowH * 0.3, w * 0.05, rowH * 0.4);
    }
  }
}

function drawResearchLab(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  rect(ctx, sx + w * 0.05, sy + h * 0.35, w * 0.9, h * 0.65, '#065f46');
  // Dome
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.ellipse(sx + w / 2, sy + h * 0.35, w * 0.38, h * 0.25, 0, Math.PI, 0, true);
  ctx.fill();
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.ellipse(sx + w / 2, sy + h * 0.35, w * 0.28, h * 0.16, 0, Math.PI, 0, true);
  ctx.fill();
  if (ts < 28) return;
  windows(ctx, sx + w * 0.12, sy + h * 0.45, w * 0.76, h * 0.42, 3, 2, '#6ee7b7', time);
  // Antenna
  if (ts > 40) {
    rect(ctx, sx + w / 2, sy + h * 0.08, w * 0.02, h * 0.28, '#4b5563');
    rect(ctx, sx + w * 0.4, sy + h * 0.14, w * 0.2, h * 0.025, '#4b5563');
  }
}

function drawGpuFarm(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  // Warehouse body
  rect(ctx, sx + w * 0.02, sy + h * 0.2, w * 0.96, h * 0.8, '#4c1d95');
  // Pitched roof
  triangleRoof(ctx, sx + w * 0.02, sy, w * 0.96, h * 0.22, '#3b0764');
  if (ts < 24) return;
  // Horizontal vent strips
  const vents = 5;
  for (let i = 0; i < vents; i++) {
    const vy = sy + h * 0.28 + i * h * 0.14;
    rect(ctx, sx + w * 0.05, vy, w * 0.9, h * 0.06, '#1e0d3e');
    // Fan circles
    for (let j = 0; j < 4; j++) {
      const fcx = sx + w * 0.12 + j * w * 0.24;
      const fcy = vy + h * 0.03;
      const fr = h * 0.025;
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = Math.max(1, ts * 0.015);
      ctx.beginPath();
      ctx.arc(fcx, fcy, fr, time, time + Math.PI * 2 * 0.8);
      ctx.stroke();
    }
  }
}

function drawServerFarm(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  // Low warehouse
  rect(ctx, sx + w * 0.02, sy + h * 0.25, w * 0.96, h * 0.75, '#7c2d12');
  // Flat roof
  rect(ctx, sx + w * 0.02, sy + h * 0.18, w * 0.96, h * 0.09, '#9a3412');
  if (ts < 28) return;
  // Satellite dish
  if (ts > 36) {
    const dc = { x: sx + w * 0.7, y: sy + h * 0.12, r: w * 0.15 };
    ctx.fillStyle = '#d1d5db';
    ctx.beginPath();
    ctx.ellipse(dc.x, dc.y, dc.r, dc.r * 0.4, -0.4, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, dc.x - w * 0.015, dc.y - h * 0.02, w * 0.03, h * 0.1, '#9ca3af');
  }
  // Loading dock
  rect(ctx, sx + w * 0.25, sy + h * 0.82, w * 0.5, h * 0.18, '#6b2600');
  windows(ctx, sx + w * 0.06, sy + h * 0.32, w * 0.88, h * 0.45, 4, 2, '#fde68a', time);
}

function drawAiLab(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, ts: number, time: number) {
  // Modern curved base
  ctx.fillStyle = '#831843';
  ctx.beginPath();
  ctx.roundRect(sx + w * 0.03, sy + h * 0.25, w * 0.94, h * 0.75, ts * 0.08);
  ctx.fill();
  // Circular glass atrium
  const pulse = 0.5 + Math.sin(time * 1.5) * 0.15;
  ctx.fillStyle = `rgba(251,207,232,${pulse})`;
  ctx.beginPath();
  ctx.arc(sx + w / 2, sy + h * 0.35, w * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#be185d';
  ctx.beginPath();
  ctx.arc(sx + w / 2, sy + h * 0.35, w * 0.18, 0, Math.PI * 2);
  ctx.fill();
  if (ts < 28) return;
  windows(ctx, sx + w * 0.08, sy + h * 0.52, w * 0.84, h * 0.38, 4, 2, '#fbcfe8', time);
  // Antenna array
  if (ts > 40) {
    for (let i = 0; i < 3; i++) {
      const ax = sx + w * (0.3 + i * 0.2);
      const heights = [h * 0.18, h * 0.1, h * 0.14];
      rect(ctx, ax, sy + h * 0.07, w * 0.015, heights[i], '#9d174d');
    }
  }
}

// ── People animation ────────────────────────────────────────────────────────
function drawPeople(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, w: number, h: number,
  count: number, seed: number, time: number, ts: number,
) {
  const r = Math.max(2, ts * 0.04);
  ctx.fillStyle = 'rgba(252,211,77,0.9)';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + seed;
    const radius = Math.min(w, h) * 0.22;
    const px = sx + w / 2 + Math.cos(a + time * 0.4) * radius + Math.sin(time * 0.6 + i * 2.1) * radius * 0.3;
    const py = sy + h / 2 + Math.sin(a + time * 0.4) * radius * 0.7 + Math.cos(time * 0.8 + i * 1.7) * radius * 0.2;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Main renderer ────────────────────────────────────────────────────────────
export class Renderer {
  private game: Game;
  private time = 0;

  constructor(game: Game) { this.game = game; }

  render() {
    const { canvas, ctx, camera, state } = this.game;
    this.time = performance.now() / 1000;
    const ts = TILE_SIZE * camera.zoom;

    ctx.fillStyle = '#0b1320';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startTX = Math.max(0, Math.floor(camera.x - canvas.width / 2 / ts));
    const endTX = Math.min(GRID_W - 1, Math.ceil(camera.x + canvas.width / 2 / ts));
    const startTY = Math.max(0, Math.floor(camera.y - canvas.height / 2 / ts));
    const endTY = Math.min(GRID_H - 1, Math.ceil(camera.y + canvas.height / 2 / ts));

    // Terrain
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        const sx = (tx - camera.x) * ts + canvas.width / 2;
        const sy = (ty - camera.y) * ts + canvas.height / 2;
        // City zone: slightly different ground tone
        const inCity = tx < CITY_WIDTH;
        const isEven = (tx + ty) % 2 === 0;
        ctx.fillStyle = inCity
          ? (isEven ? '#3d5c2c' : '#395428')
          : (isEven ? '#2f4d1e' : '#2b451a');
        ctx.fillRect(sx, sy, ts + 0.5, ts + 0.5);
      }
    }

    // Grid lines at higher zoom
    if (ts > 28) {
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let tx = startTX; tx <= endTX + 1; tx++) {
        const sx = (tx - camera.x) * ts + canvas.width / 2;
        ctx.moveTo(sx, (startTY - camera.y) * ts + canvas.height / 2);
        ctx.lineTo(sx, (endTY + 1 - camera.y) * ts + canvas.height / 2);
      }
      for (let ty = startTY; ty <= endTY + 1; ty++) {
        const sy = (ty - camera.y) * ts + canvas.height / 2;
        ctx.moveTo((startTX - camera.x) * ts + canvas.width / 2, sy);
        ctx.lineTo((endTX + 1 - camera.x) * ts + canvas.width / 2, sy);
      }
      ctx.stroke();
    }

    // City border marker
    if (CITY_WIDTH >= startTX && CITY_WIDTH <= endTX + 1) {
      const bx = (CITY_WIDTH - camera.x) * ts + canvas.width / 2;
      ctx.strokeStyle = 'rgba(251,191,36,0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Infra (auto-tiled)
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        const t = state.grid[ty][tx];
        if (t.infra && !t.buildingId) {
          const sx = (tx - camera.x) * ts + canvas.width / 2;
          const sy = (ty - camera.y) * ts + canvas.height / 2;
          const mask = infraMask(state.grid, tx, ty, t.infra);
          if (t.infra === 'road') drawRoad(ctx, sx, sy, ts, mask);
          else if (t.infra === 'railway') drawRailway(ctx, sx, sy, ts, mask);
          else if (t.infra === 'power_line') drawPowerLine(ctx, sx, sy, ts, mask);
        }
      }
    }

    // Buildings
    const seen = new Set<string>();
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        const bid = state.grid[ty][tx].buildingId;
        if (bid && !seen.has(bid)) {
          seen.add(bid);
          const b = state.buildings[bid];
          if (b) this.drawBuilding(b, ts);
        }
      }
    }

    // Selection ring (only when something is selected)
    if (this.game.selected) {
      const b = this.game.selected;
      const def = BUILDING_DEFS[b.type];
      const sx = (b.x - camera.x) * ts + canvas.width / 2;
      const sy = (b.y - camera.y) * ts + canvas.height / 2;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.strokeRect(sx, sy, def.size * ts, def.size * ts);
    }

    // Hover preview
    if (this.game.hover && this.game.buildMode) {
      this.drawHover(this.game.hover, this.game.buildMode, ts);
    }

    // World edge
    const ex = (0 - camera.x) * ts + canvas.width / 2;
    const ey = (0 - camera.y) * ts + canvas.height / 2;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(ex, ey, GRID_W * ts, GRID_H * ts);
  }

  private drawBuilding(b: PlacedBuilding, ts: number) {
    const { ctx, camera, canvas } = this.game;
    const def = BUILDING_DEFS[b.type];
    const sx = (b.x - camera.x) * ts + canvas.width / 2;
    const sy = (b.y - camera.y) * ts + canvas.height / 2;
    const w = def.size * ts;
    const h = def.size * ts;

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 3, sy + 3, w, h);

    // Idle overlay
    if (!b.operational) {
      ctx.globalAlpha = 0.5;
    }

    this.drawShape(b.type, sx, sy, w, h, ts, b.operational);

    ctx.globalAlpha = 1;

    // Idle indicator
    if (!b.operational && ts > 32) {
      ctx.font = `${Math.max(10, ts * 0.2)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('💤', sx + w - 2, sy + 2);
    }

    // Animated people for operational buildings
    if (b.operational && ts > 28) {
      const count = Math.min(4, def.size * 2);
      const seed = (b.x * 13 + b.y * 7) % (Math.PI * 2);
      drawPeople(ctx, sx + w * 0.1, sy + h * 0.55, w * 0.8, h * 0.35, count, seed, this.time, ts);
    }
  }

  private drawShape(type: BuildingType, sx: number, sy: number, w: number, h: number, ts: number, _operational: boolean) {
    const ctx = this.game.ctx;
    const t = this.time;
    switch (type) {
      case 'city_house':     return drawCityHouse(ctx, sx, sy, w, h, ts, t);
      case 'town_hall':      return drawTownHall(ctx, sx, sy, w, h, ts, t);
      case 'city_market':    return drawCityMarket(ctx, sx, sy, w, h, ts, t);
      case 'city_station':   return drawStation(ctx, sx, sy, w, h, ts, t, true);
      case 'city_park':      return drawCityPark(ctx, sx, sy, w, h, ts, t);
      case 'station':        return drawStation(ctx, sx, sy, w, h, ts, t, false);
      case 'hq':             return drawHQ(ctx, sx, sy, w, h, ts, t);
      case 'power_plant':    return drawPowerPlant(ctx, sx, sy, w, h, ts, t);
      case 'office':         return drawOffice(ctx, sx, sy, w, h, ts, t);
      case 'data_center':    return drawDataCenter(ctx, sx, sy, w, h, ts, t);
      case 'research_lab':   return drawResearchLab(ctx, sx, sy, w, h, ts, t);
      case 'gpu_farm':       return drawGpuFarm(ctx, sx, sy, w, h, ts, t);
      case 'server_farm':    return drawServerFarm(ctx, sx, sy, w, h, ts, t);
      case 'ai_lab':         return drawAiLab(ctx, sx, sy, w, h, ts, t);
    }
  }

  private drawHover(hover: { x: number; y: number }, mode: NonNullable<BuildMode>, ts: number) {
    const { ctx, camera, canvas, state } = this.game;
    const sx = (hover.x - camera.x) * ts + canvas.width / 2;
    const sy = (hover.y - camera.y) * ts + canvas.height / 2;

    if (mode.kind === 'building') {
      const def = BUILDING_DEFS[mode.type];
      const w = def.size * ts, h = def.size * ts;
      const ok = canPlaceAt(state, mode.type, hover.x, hover.y);
      ctx.fillStyle = ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
      ctx.fillRect(sx, sy, w, h);
      ctx.strokeStyle = ok ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, w, h);
      if (ts > 16) {
        ctx.font = `${Math.min(ts * 0.5, 36) * Math.min(def.size, 2)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.6;
        ctx.fillText(def.icon, sx + w / 2, sy + h / 2);
        ctx.globalAlpha = 1;
      }
    } else if (mode.kind === 'infra') {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(sx, sy, ts, ts);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, ts, ts);
    } else if (mode.kind === 'demolish') {
      ctx.fillStyle = 'rgba(239,68,68,0.35)';
      ctx.fillRect(sx, sy, ts, ts);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, ts, ts);
    }
  }
}

function canPlaceAt(state: { grid: Tile[][] }, type: BuildingType, x: number, y: number): boolean {
  const def = BUILDING_DEFS[type];
  if (x < CITY_WIDTH + 1 || y < 0 || x + def.size > GRID_W || y + def.size > GRID_H) return false;
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      if (state.grid[y + dy][x + dx].buildingId) return false;
    }
  }
  return true;
}
