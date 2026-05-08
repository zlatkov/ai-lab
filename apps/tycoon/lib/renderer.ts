import { TILE_SIZE, GRID_W, GRID_H, BUILDING_DEFS } from './constants';
import type { Game, BuildMode } from './game';
import type { PlacedBuilding, Tile, InfraType, BuildingType } from './types';

export class Renderer {
  private game: Game;

  constructor(game: Game) { this.game = game; }

  render() {
    const { canvas, ctx, camera, state } = this.game;
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
        this.drawTerrain(tx, ty, sx, sy, ts);
      }
    }

    // Grid lines (only when zoomed in)
    if (ts > 24) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
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

    // Infra
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        const t = state.grid[ty][tx];
        if (t.infra && !t.buildingId) {
          const sx = (tx - camera.x) * ts + canvas.width / 2;
          const sy = (ty - camera.y) * ts + canvas.height / 2;
          this.drawInfra(t.infra, sx, sy, ts);
        }
      }
    }

    // Buildings
    const seen = new Set<string>();
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        const t = state.grid[ty][tx];
        if (t.buildingId && !seen.has(t.buildingId)) {
          seen.add(t.buildingId);
          const b = state.buildings[t.buildingId];
          if (b) this.drawBuilding(b, ts);
        }
      }
    }

    // Selection
    if (this.game.selected) this.drawSelection(this.game.selected, ts);

    // Hover preview
    if (this.game.hover && this.game.buildMode) {
      this.drawHover(this.game.hover, this.game.buildMode, ts);
    }

    // Off-canvas dim
    this.drawWorldEdge(ts);
  }

  private drawTerrain(tx: number, ty: number, sx: number, sy: number, ts: number) {
    const ctx = this.game.ctx;
    const isEven = (tx + ty) % 2 === 0;
    ctx.fillStyle = isEven ? '#3a6b27' : '#365f25';
    ctx.fillRect(sx, sy, ts + 0.5, ts + 0.5);
  }

  private drawInfra(infra: InfraType, sx: number, sy: number, ts: number) {
    const ctx = this.game.ctx;
    if (infra === 'road') {
      ctx.fillStyle = '#2d2d2d';
      ctx.fillRect(sx + ts * 0.1, sy + ts * 0.1, ts * 0.8, ts * 0.8);
      ctx.fillStyle = '#fbbf24';
      const w = Math.max(1, ts * 0.04);
      ctx.fillRect(sx + ts * 0.5 - w / 2, sy + ts * 0.25, w, ts * 0.5);
    } else if (infra === 'railway') {
      ctx.fillStyle = '#5b3a1a';
      ctx.fillRect(sx + ts * 0.15, sy + ts * 0.15, ts * 0.7, ts * 0.7);
      ctx.fillStyle = '#94a3b8';
      const rw = Math.max(1, ts * 0.05);
      ctx.fillRect(sx + ts * 0.32, sy + ts * 0.2, rw, ts * 0.6);
      ctx.fillRect(sx + ts * 0.62, sy + ts * 0.2, rw, ts * 0.6);
    } else if (infra === 'power_line') {
      ctx.fillStyle = '#4a3a20';
      ctx.fillRect(sx + ts * 0.45, sy + ts * 0.2, ts * 0.1, ts * 0.6);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(sx + ts * 0.25, sy + ts * 0.3, ts * 0.5, ts * 0.04);
    }
  }

  private drawBuilding(b: PlacedBuilding, ts: number) {
    const { ctx, camera, canvas } = this.game;
    const def = BUILDING_DEFS[b.type];
    const sx = (b.x - camera.x) * ts + canvas.width / 2;
    const sy = (b.y - camera.y) * ts + canvas.height / 2;
    const w = def.size * ts;
    const h = def.size * ts;
    const inset = Math.max(1, ts * 0.04);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(sx + 3, sy + 3, w - inset * 2, h - inset * 2);

    ctx.fillStyle = b.operational ? def.color : '#525252';
    ctx.fillRect(sx + inset, sy + inset, w - inset * 2, h - inset * 2);

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(sx + inset, sy + inset, w - inset * 2, Math.max(2, h * 0.08));

    ctx.strokeStyle = b.operational ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + inset, sy + inset, w - inset * 2, h - inset * 2);

    if (ts > 14) {
      const fs = Math.min(ts * 0.55, 36) * (def.size > 1 ? 1.5 : 1);
      ctx.font = `${fs}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, sx + w / 2, sy + h / 2);
    }

    if (!b.operational && ts > 28) {
      ctx.font = `${Math.max(10, ts * 0.22)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('💤', sx + w - 4, sy + 2);
    }
  }

  private drawSelection(b: PlacedBuilding, ts: number) {
    const { ctx, camera, canvas } = this.game;
    const def = BUILDING_DEFS[b.type];
    const sx = (b.x - camera.x) * ts + canvas.width / 2;
    const sy = (b.y - camera.y) * ts + canvas.height / 2;
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx, sy, def.size * ts, def.size * ts);
  }

  private drawHover(hover: { x: number; y: number }, mode: NonNullable<BuildMode>, ts: number) {
    const { ctx, camera, canvas, state } = this.game;
    const sx = (hover.x - camera.x) * ts + canvas.width / 2;
    const sy = (hover.y - camera.y) * ts + canvas.height / 2;

    if (mode.kind === 'building') {
      const def = BUILDING_DEFS[mode.type];
      const w = def.size * ts;
      const h = def.size * ts;
      const ok = canPlace(state, mode.type, hover.x, hover.y);
      ctx.fillStyle = ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)';
      ctx.fillRect(sx, sy, w, h);
      ctx.strokeStyle = ok ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, w, h);
      if (ts > 16) {
        ctx.font = `${Math.min(ts * 0.4, 28)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.7;
        ctx.fillText(def.icon, sx + w / 2, sy + h / 2);
        ctx.globalAlpha = 1;
      }
    } else if (mode.kind === 'infra') {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(sx, sy, ts, ts);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, ts, ts);
    } else if (mode.kind === 'demolish') {
      ctx.fillStyle = 'rgba(239,68,68,0.4)';
      ctx.fillRect(sx, sy, ts, ts);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, ts, ts);
    }
  }

  private drawWorldEdge(ts: number) {
    const { ctx, camera, canvas } = this.game;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    const x0 = (0 - camera.x) * ts + canvas.width / 2;
    const y0 = (0 - camera.y) * ts + canvas.height / 2;
    ctx.strokeRect(x0, y0, GRID_W * ts, GRID_H * ts);
  }
}

function canPlace(state: { grid: Tile[][] }, type: BuildingType, x: number, y: number): boolean {
  const def = BUILDING_DEFS[type];
  if (x < 0 || y < 0 || x + def.size > GRID_W || y + def.size > GRID_H) return false;
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      if (state.grid[y + dy][x + dx].buildingId) return false;
    }
  }
  return true;
}
