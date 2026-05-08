import type { Game } from './game';
import { GRID_W, GRID_H, TILE_SIZE } from './constants';

const DIRS: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const CAR_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316'];
const BUS_STOP_COORDS: Array<[number, number]> = [
  [4, 10], [1, 10], [7, 10],
  [4, 21], [1, 21], [7, 21],
  [4, 31], [4, 41], [4, 52],
];

interface TrailSeg { fromX: number; fromY: number; toX: number; toY: number; progress: number; }

interface Vehicle {
  type: 'car' | 'bus' | 'train';
  infraType: 'road' | 'railway';
  fromX: number; fromY: number;
  toX: number; toY: number;
  progress: number;
  speed: number;
  color: string;
  waitTimer: number;
  trail: TrailSeg[];
  lane: number; // -0.5..0.5 offset perpendicular to direction
}

export interface BusStop { x: number; y: number; }

export class VehicleSystem {
  private vehicles: Vehicle[] = [];
  busStops: BusStop[] = [];
  private lastTime = 0;
  private prevRoadCount = -1;
  private prevRailCount = -1;

  constructor(private game: Game) {
    this.lastTime = performance.now();
    this.refresh();
  }

  refresh() {
    const roadTiles = this.getTiles('road');
    const railTiles = this.getTiles('railway');
    this.prevRoadCount = roadTiles.length;
    this.prevRailCount = railTiles.length;
    this.vehicles = [];

    this.busStops = BUS_STOP_COORDS
      .filter(([x, y]) => {
        const g = this.game.state.grid;
        return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && g[y][x].infra === 'road';
      })
      .map(([x, y]) => ({ x, y }));

    if (roadTiles.length === 0 && railTiles.length === 0) return;

    // Cars
    const carCount = Math.min(30, Math.max(4, Math.floor(roadTiles.length * 0.18)));
    for (let i = 0; i < carCount && roadTiles.length > 0; i++) {
      const [fx, fy] = roadTiles[Math.floor(Math.random() * roadTiles.length)];
      const [tx, ty] = this.pickNext(fx, fy, fx - 1, fy, 'road');
      this.vehicles.push({
        type: 'car', infraType: 'road',
        fromX: fx, fromY: fy, toX: tx, toY: ty,
        progress: Math.random(),
        speed: 1.4 + Math.random() * 1.6,
        color: CAR_COLORS[i % CAR_COLORS.length],
        waitTimer: 0, trail: [],
        lane: (Math.random() - 0.5) * 0.28,
      });
    }

    // Buses
    const busCount = Math.min(5, Math.max(roadTiles.length >= 10 ? 2 : 0, Math.floor(roadTiles.length / 18)));
    for (let i = 0; i < busCount; i++) {
      const [fx, fy] = roadTiles[Math.floor(Math.random() * roadTiles.length)];
      const [tx, ty] = this.pickNext(fx, fy, fx - 1, fy, 'road');
      this.vehicles.push({
        type: 'bus', infraType: 'road',
        fromX: fx, fromY: fy, toX: tx, toY: ty,
        progress: Math.random(),
        speed: 0.85,
        color: '#facc15',
        waitTimer: Math.random() * 2,
        trail: [{ fromX: fx, fromY: fy, toX: tx, toY: ty, progress: 0 }],
        lane: 0.08,
      });
    }

    // Trains
    const trainCount = railTiles.length >= 3
      ? Math.min(3, Math.max(1, Math.floor(railTiles.length / 10)))
      : 0;
    for (let i = 0; i < trainCount; i++) {
      const [fx, fy] = railTiles[Math.floor(Math.random() * railTiles.length)];
      const [tx, ty] = this.pickNext(fx, fy, fx - 1, fy, 'railway');
      const trail: TrailSeg[] = [];
      for (let s = 0; s < 3; s++) trail.push({ fromX: fx, fromY: fy, toX: fx, toY: fy, progress: 0 });
      this.vehicles.push({
        type: 'train', infraType: 'railway',
        fromX: fx, fromY: fy, toX: tx, toY: ty,
        progress: Math.random(),
        speed: 2.5,
        color: '#1d4ed8',
        waitTimer: 0, trail, lane: 0,
      });
    }
  }

  checkRefresh() {
    const g = this.game.state.grid;
    let road = 0, rail = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const inf = g[y][x].infra;
        if (inf === 'road') road++;
        else if (inf === 'railway') rail++;
      }
    }
    if (Math.abs(road - this.prevRoadCount) > 5 || Math.abs(rail - this.prevRailCount) > 2) {
      this.refresh();
    }
  }

  private getTiles(infra: 'road' | 'railway'): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const g = this.game.state.grid;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (g[y][x].infra === infra) out.push([x, y]);
      }
    }
    return out;
  }

  private pickNext(x: number, y: number, prevX: number, prevY: number, infra: 'road' | 'railway'): [number, number] {
    const g = this.game.state.grid;
    const cands: Array<[number, number]> = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      if (g[ny][nx].infra !== infra) continue;
      if (nx === prevX && ny === prevY) continue;
      cands.push([nx, ny]);
    }
    if (cands.length === 0) return [prevX, prevY];
    const sdx = x - prevX, sdy = y - prevY;
    const straight = cands.find(([cx, cy]) => cx - x === sdx && cy - y === sdy);
    if (straight && Math.random() < 0.65) return straight;
    return cands[Math.floor(Math.random() * cands.length)];
  }

  update(now: number) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const g = this.game.state.grid;

    for (const v of this.vehicles) {
      if (v.waitTimer > 0) {
        v.waitTimer = Math.max(0, v.waitTimer - dt);
        for (const t of v.trail) t.progress = v.progress;
        continue;
      }

      v.progress += v.speed * dt;

      while (v.progress >= 1) {
        v.progress -= 1;

        // If destination tile lost infra, teleport
        if (g[v.toY]?.[v.toX]?.infra !== v.infraType) {
          const tiles = this.getTiles(v.infraType);
          if (tiles.length === 0) { v.progress = 0; break; }
          const [nx, ny] = tiles[Math.floor(Math.random() * tiles.length)];
          v.fromX = nx; v.fromY = ny;
          const [tx, ty] = this.pickNext(nx, ny, nx - 1, ny, v.infraType);
          v.toX = tx; v.toY = ty;
          break;
        }

        if (v.trail.length > 0) {
          for (let i = v.trail.length - 1; i > 0; i--) v.trail[i] = { ...v.trail[i - 1] };
          v.trail[0] = { fromX: v.fromX, fromY: v.fromY, toX: v.toX, toY: v.toY, progress: v.progress };
        }
        const prev: [number, number] = [v.fromX, v.fromY];
        v.fromX = v.toX; v.fromY = v.toY;
        const [nx, ny] = this.pickNext(v.toX, v.toY, prev[0], prev[1], v.infraType);
        v.toX = nx; v.toY = ny;

        if (v.type === 'bus' && this.busStops.some(s => s.x === v.fromX && s.y === v.fromY)) {
          v.waitTimer = 1.0 + Math.random() * 1.5;
        }
      }

      for (const t of v.trail) t.progress = v.progress;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number, cw: number, ch: number) {
    const ts = TILE_SIZE * zoom;
    const toSX = (wx: number) => (wx - camX) * ts + cw / 2;
    const toSY = (wy: number) => (wy - camY) * ts + ch / 2;

    // Bus stops
    if (ts >= 18) {
      for (const s of this.busStops) {
        const sx = toSX(s.x + 0.5), sy = toSY(s.y + 0.3);
        if (sx < -ts || sx > cw + ts || sy < -ts || sy > ch + ts) continue;
        drawBusStop(ctx, sx, sy, ts);
      }
    }

    for (const type of ['car', 'bus', 'train'] as const) {
      for (const v of this.vehicles) {
        if (v.type !== type) continue;

        const dx = v.toX - v.fromX, dy = v.toY - v.fromY;
        const perpX = -dy, perpY = dx; // perpendicular for lane offset
        const wx = v.fromX + dx * v.progress + 0.5 + perpX * v.lane;
        const wy = v.fromY + dy * v.progress + 0.5 + perpY * v.lane;
        const sx = toSX(wx), sy = toSY(wy);
        if (sx < -ts * 3 || sx > cw + ts * 3 || sy < -ts * 3 || sy > ch + ts * 3) continue;

        if (type === 'car') {
          drawCar(ctx, sx, sy, ts, dx, dy, v.color);
        } else if (type === 'bus') {
          if (v.trail.length > 0) {
            const t = v.trail[0];
            const tdx = t.toX - t.fromX, tdy = t.toY - t.fromY;
            const twx = t.fromX + tdx * t.progress + 0.5 + (-tdy) * v.lane;
            const twy = t.fromY + tdy * t.progress + 0.5 + tdx * v.lane;
            drawBus(ctx, toSX(twx), toSY(twy), ts, dx, dy, '#a16207');
          }
          drawBus(ctx, sx, sy, ts, dx, dy, v.color);
        } else {
          for (let i = v.trail.length - 1; i >= 0; i--) {
            const t = v.trail[i];
            const tdx = t.toX - t.fromX, tdy = t.toY - t.fromY;
            const twx = t.fromX + tdx * t.progress + 0.5;
            const twy = t.fromY + tdy * t.progress + 0.5;
            drawTrainCar(ctx, toSX(twx), toSY(twy), ts, tdx, tdy, '#1e3a8a', false);
          }
          drawTrainCar(ctx, sx, sy, ts, dx, dy, v.color, true);
        }
      }
    }
  }
}

function drawBusStop(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number) {
  const s = ts * 0.1;
  // Roof
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(sx - s * 2, sy - s * 2.6, s * 4, s * 0.5);
  // Post
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(sx - s * 0.35, sy - s * 2.1, s * 0.7, s * 2.1);
  // Bench
  ctx.fillStyle = '#93c5fd';
  ctx.fillRect(sx - s * 1.4, sy - s * 0.4, s * 2.8, s * 0.35);
  if (ts >= 26) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(6, ts * 0.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', sx, sy - s * 1.3);
  }
}

function drawCar(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number, dx: number, dy: number, color: string) {
  if (ts < 8) return;
  const isNS = dy !== 0 || dx === 0;
  const bw = ts * 0.26, bh = ts * 0.14;
  const cw = isNS ? bh : bw, ch = isNS ? bw : bh;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-cw / 2, -ch / 2, cw, ch, Math.min(cw, ch) * 0.3);
  else ctx.rect(-cw / 2, -ch / 2, cw, ch);
  ctx.fill();
  if (ts >= 20) {
    ctx.fillStyle = 'rgba(200,240,255,0.75)';
    const ww = isNS ? cw * 0.7 : cw * 0.22, wh = isNS ? ch * 0.22 : ch * 0.7;
    const wox = isNS ? -ww / 2 : (dx > 0 ? cw / 2 - ww - ts * 0.015 : -cw / 2 + ts * 0.015);
    const woy = isNS ? (dy > 0 ? ch / 2 - wh - ts * 0.015 : -ch / 2 + ts * 0.015) : -wh / 2;
    ctx.fillRect(wox, woy, ww, wh);
  }
  ctx.restore();
}

function drawBus(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number, dx: number, dy: number, color: string) {
  if (ts < 8) return;
  const isNS = dy !== 0 || dx === 0;
  const bw = ts * 0.36, bh = ts * 0.2;
  const cw = isNS ? bh : bw, ch = isNS ? bw : bh;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-cw / 2, -ch / 2, cw, ch, Math.min(cw, ch) * 0.15);
  else ctx.rect(-cw / 2, -ch / 2, cw, ch);
  ctx.fill();
  if (ts >= 18) {
    ctx.fillStyle = 'rgba(200,240,255,0.6)';
    if (isNS) ctx.fillRect(-cw * 0.38, -ch * 0.22, cw * 0.76, ch * 0.44);
    else ctx.fillRect(-cw * 0.22, -ch * 0.38, cw * 0.44, ch * 0.76);
  }
  ctx.restore();
}

function drawTrainCar(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number, dx: number, dy: number, color: string, isHead: boolean) {
  if (ts < 8) return;
  const isNS = dy !== 0 || dx === 0;
  const bw = ts * 0.44, bh = ts * 0.28;
  const cw = isNS ? bh : bw, ch = isNS ? bw : bh;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-cw / 2, -ch / 2, cw, ch, ts * 0.04);
  else ctx.rect(-cw / 2, -ch / 2, cw, ch);
  ctx.fill();
  if (ts >= 16) {
    ctx.fillStyle = 'rgba(200,240,255,0.45)';
    if (isNS) ctx.fillRect(-cw * 0.32, -ch * 0.2, cw * 0.64, ch * 0.4);
    else ctx.fillRect(-cw * 0.2, -ch * 0.32, cw * 0.4, ch * 0.64);
  }
  if (isHead && ts >= 14) {
    ctx.fillStyle = '#fef08a';
    if (dx > 0) ctx.fillRect(cw / 2 - ts * 0.05, -ch * 0.2, ts * 0.04, ch * 0.4);
    else if (dx < 0) ctx.fillRect(-cw / 2, -ch * 0.2, ts * 0.04, ch * 0.4);
    else if (dy > 0) ctx.fillRect(-cw * 0.2, ch / 2 - ts * 0.05, cw * 0.4, ts * 0.04);
    else ctx.fillRect(-cw * 0.2, -ch / 2, cw * 0.4, ts * 0.04);
  }
  ctx.restore();
}
