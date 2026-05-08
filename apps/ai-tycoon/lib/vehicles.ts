import type { Game } from './game';
import { GRID_W, GRID_H, TILE_SIZE, BUILDING_DEFS } from './constants';

const DIRS: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const CAR_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#a78bfa'];
const BUS_STOP_COORDS: Array<[number, number]> = [
  [4, 10], [1, 10], [7, 10],
  [4, 21], [1, 21], [7, 21],
  [4, 31], [4, 41], [4, 52],
];

export interface BusStop { x: number; y: number; }

interface TrailSeg { fromX: number; fromY: number; toX: number; toY: number; progress: number; }

// Trip-based car: travels from one building's road entry to another's, then despawns
interface TripCar {
  path: Array<[number, number]>; // road tile sequence
  segIdx: number;                // currently between path[segIdx] and path[segIdx+1]
  progress: number;              // 0..1 within segment
  speed: number;
  color: string;
  lane: number;
}

// Loop vehicle: bus or train that wanders continuously
interface LoopVehicle {
  type: 'bus' | 'train';
  infraType: 'road' | 'railway';
  fromX: number; fromY: number;
  toX: number; toY: number;
  progress: number;
  speed: number;
  color: string;
  waitTimer: number;
  trail: TrailSeg[];
  lane: number;
}

export class VehicleSystem {
  private cars: TripCar[] = [];
  private loops: LoopVehicle[] = [];
  busStops: BusStop[] = [];

  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL = 0.9; // seconds between car spawns
  private readonly MAX_CARS = 28;

  private buildingEntries: Array<[number, number]> = []; // road tiles adjacent to buildings
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

    this.cars = [];
    this.loops = [];
    this.buildingEntries = this.computeBuildingEntries();

    this.busStops = BUS_STOP_COORDS
      .filter(([x, y]) => {
        const g = this.game.state.grid;
        return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && g[y][x].infra === 'road';
      })
      .map(([x, y]) => ({ x, y }));

    // Seed a few cars immediately
    for (let i = 0; i < Math.min(8, this.buildingEntries.length); i++) {
      this.spawnCar();
    }

    // Buses
    const busCount = Math.min(5, Math.max(roadTiles.length >= 10 ? 2 : 0, Math.floor(roadTiles.length / 18)));
    for (let i = 0; i < busCount; i++) {
      if (roadTiles.length === 0) break;
      const [fx, fy] = roadTiles[Math.floor(Math.random() * roadTiles.length)];
      const [tx, ty] = this.pickNext(fx, fy, fx - 1, fy, 'road');
      this.loops.push({
        type: 'bus', infraType: 'road',
        fromX: fx, fromY: fy, toX: tx, toY: ty,
        progress: Math.random(), speed: 0.85,
        color: '#facc15', waitTimer: Math.random() * 2,
        trail: [{ fromX: fx, fromY: fy, toX: tx, toY: ty, progress: 0 }],
        lane: 0.08,
      });
    }

    // Trains
    const trainCount = railTiles.length >= 3
      ? Math.min(3, Math.max(1, Math.floor(railTiles.length / 10))) : 0;
    for (let i = 0; i < trainCount; i++) {
      const [fx, fy] = railTiles[Math.floor(Math.random() * railTiles.length)];
      const [tx, ty] = this.pickNext(fx, fy, fx - 1, fy, 'railway');
      const trail: TrailSeg[] = [];
      for (let s = 0; s < 3; s++) trail.push({ fromX: fx, fromY: fy, toX: fx, toY: fy, progress: 0 });
      this.loops.push({
        type: 'train', infraType: 'railway',
        fromX: fx, fromY: fy, toX: tx, toY: ty,
        progress: Math.random(), speed: 2.5,
        color: '#1d4ed8', waitTimer: 0,
        trail, lane: 0,
      });
    }
  }

  checkRefresh() {
    const g = this.game.state.grid;
    let road = 0, rail = 0;
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++) {
        const inf = g[y][x].infra;
        if (inf === 'road') road++;
        else if (inf === 'railway') rail++;
      }
    if (Math.abs(road - this.prevRoadCount) > 5 || Math.abs(rail - this.prevRailCount) > 2)
      this.refresh();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private getTiles(infra: 'road' | 'railway'): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const g = this.game.state.grid;
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++)
        if (g[y][x].infra === infra) out.push([x, y]);
    return out;
  }

  private computeBuildingEntries(): Array<[number, number]> {
    const g = this.game.state.grid;
    const seen = new Set<number>();
    const out: Array<[number, number]> = [];
    for (const b of Object.values(this.game.state.buildings)) {
      const def = BUILDING_DEFS[b.type];
      outer: for (let dy = -1; dy <= def.size; dy++) {
        for (let dx = -1; dx <= def.size; dx++) {
          if (dx >= 0 && dx < def.size && dy >= 0 && dy < def.size) continue;
          const rx = b.x + dx, ry = b.y + dy;
          if (rx < 0 || ry < 0 || rx >= GRID_W || ry >= GRID_H) continue;
          if (g[ry][rx].infra === 'road') {
            const k = ry * GRID_W + rx;
            if (!seen.has(k)) { seen.add(k); out.push([rx, ry]); }
            break outer;
          }
        }
      }
    }
    return out;
  }

  private findPath(sx: number, sy: number, tx: number, ty: number): Array<[number, number]> | null {
    if (sx === tx && sy === ty) return null;
    const g = this.game.state.grid;
    const enc = (x: number, y: number) => y * GRID_W + x;
    const targetKey = enc(tx, ty);
    const parent = new Map<number, number>();
    parent.set(enc(sx, sy), -1);
    const queue: Array<[number, number]> = [[sx, sy]];
    let found = false;
    while (queue.length > 0 && parent.size < 1500) {
      const [x, y] = queue.shift()!;
      if (enc(x, y) === targetKey) { found = true; break; }
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        if (g[ny][nx].infra !== 'road') continue;
        const nk = enc(nx, ny);
        if (parent.has(nk)) continue;
        parent.set(nk, enc(x, y));
        queue.push([nx, ny]);
      }
    }
    if (!found) return null;
    const path: Array<[number, number]> = [];
    let cur = targetKey;
    while (cur !== -1) {
      path.unshift([cur % GRID_W, Math.floor(cur / GRID_W)]);
      cur = parent.get(cur)!;
    }
    return path;
  }

  private spawnCar() {
    if (this.buildingEntries.length < 2) return;
    const srcIdx = Math.floor(Math.random() * this.buildingEntries.length);
    let dstIdx: number;
    do { dstIdx = Math.floor(Math.random() * this.buildingEntries.length); }
    while (dstIdx === srcIdx);
    const [sx, sy] = this.buildingEntries[srcIdx];
    const [tx, ty] = this.buildingEntries[dstIdx];
    const path = this.findPath(sx, sy, tx, ty);
    if (!path || path.length < 2) return;
    this.cars.push({
      path, segIdx: 0, progress: 0,
      speed: 1.6 + Math.random() * 1.4,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      lane: (Math.random() - 0.5) * 0.22,
    });
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

  // ── Update ───────────────────────────────────────────────────────────────────

  update(now: number) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // Spawn new cars
    if (this.cars.length < this.MAX_CARS && this.buildingEntries.length >= 2) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.SPAWN_INTERVAL;
        this.spawnCar();
      }
    }

    // Update trip cars
    this.cars = this.cars.filter(c => {
      c.progress += c.speed * dt;
      while (c.progress >= 1) {
        c.progress -= 1;
        c.segIdx++;
        if (c.segIdx >= c.path.length - 1) return false; // reached destination
      }
      return true;
    });

    // Update loop vehicles (buses, trains)
    const g = this.game.state.grid;
    for (const v of this.loops) {
      if (v.waitTimer > 0) {
        v.waitTimer = Math.max(0, v.waitTimer - dt);
        for (const t of v.trail) t.progress = v.progress;
        continue;
      }
      v.progress += v.speed * dt;
      while (v.progress >= 1) {
        v.progress -= 1;
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
        if (v.type === 'bus' && this.busStops.some(s => s.x === v.fromX && s.y === v.fromY))
          v.waitTimer = 1.0 + Math.random() * 1.5;
      }
      for (const t of v.trail) t.progress = v.progress;
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────

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

    // Trip cars
    for (const c of this.cars) {
      const [ax, ay] = c.path[c.segIdx];
      const [bx, by] = c.path[c.segIdx + 1] ?? c.path[c.segIdx];
      const dx = bx - ax, dy = by - ay;
      const wx = ax + dx * c.progress + 0.5 + (-dy) * c.lane;
      const wy = ay + dy * c.progress + 0.5 + dx * c.lane;
      const sx = toSX(wx), sy = toSY(wy);
      if (sx < -ts * 2 || sx > cw + ts * 2 || sy < -ts * 2 || sy > ch + ts * 2) continue;
      drawCar(ctx, sx, sy, ts, dx, dy, c.color);
    }

    // Loop vehicles (buses, trains)
    for (const type of ['bus', 'train'] as const) {
      for (const v of this.loops) {
        if (v.type !== type) continue;
        const dx = v.toX - v.fromX, dy = v.toY - v.fromY;
        const wx = v.fromX + dx * v.progress + 0.5 + (-dy) * v.lane;
        const wy = v.fromY + dy * v.progress + 0.5 + dx * v.lane;
        const sx = toSX(wx), sy = toSY(wy);
        if (sx < -ts * 3 || sx > cw + ts * 3 || sy < -ts * 3 || sy > ch + ts * 3) continue;
        if (type === 'bus') {
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
            drawTrainCar(ctx, toSX(t.fromX + tdx * t.progress + 0.5), toSY(t.fromY + tdy * t.progress + 0.5), ts, tdx, tdy, '#1e3a8a', false);
          }
          drawTrainCar(ctx, sx, sy, ts, dx, dy, v.color, true);
        }
      }
    }
  }
}

// ── Shape drawing ─────────────────────────────────────────────────────────────

function drawBusStop(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number) {
  const s = ts * 0.1;
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(sx - s * 2, sy - s * 2.6, s * 4, s * 0.5);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(sx - s * 0.35, sy - s * 2.1, s * 0.7, s * 2.1);
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

function drawTrainCar(ctx: CanvasRenderingContext2D, sx: number, sy: number, ts: number, dx: number, dy: number, _color: string, isHead: boolean) {
  if (ts < 8) return;
  ctx.save();
  ctx.translate(sx, sy);
  // Rotate so +x = direction of travel
  if (dx !== 0 || dy !== 0) ctx.rotate(Math.atan2(dy, dx));

  const len = ts * 0.82;  // along direction of travel
  const wid = ts * 0.28;  // perpendicular
  const hw = wid / 2;
  const hl = len / 2;

  if (isHead) {
    // ── Locomotive ────────────────────────────────────────────
    // Under-frame / running board
    ctx.fillStyle = '#111827';
    ctx.fillRect(-hl, -hw - ts * 0.04, len, wid + ts * 0.08);

    // Main boiler body (front 60%)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-hl + len * 0.02, -hw, len * 0.6, wid, ts * 0.03);
    else ctx.rect(-hl + len * 0.02, -hw, len * 0.6, wid);
    ctx.fill();

    // Tapered nose (cowcatcher direction)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(hl - len * 0.35, -hw);
    ctx.lineTo(hl, -hw * 0.4);
    ctx.lineTo(hl, hw * 0.4);
    ctx.lineTo(hl - len * 0.35, hw);
    ctx.closePath();
    ctx.fill();

    // Cab (rear box)
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-hl, -hw - ts * 0.1, len * 0.38, wid + ts * 0.1, ts * 0.02);
    else ctx.rect(-hl, -hw - ts * 0.1, len * 0.38, wid + ts * 0.1);
    ctx.fill();

    // Cab roof
    ctx.fillStyle = '#475569';
    ctx.fillRect(-hl + len * 0.01, -hw - ts * 0.14, len * 0.36, ts * 0.06);

    if (ts >= 18) {
      // Cab windows
      ctx.fillStyle = 'rgba(186,230,253,0.8)';
      ctx.fillRect(-hl + len * 0.04, -hw - ts * 0.08, len * 0.12, ts * 0.06);
      ctx.fillRect(-hl + len * 0.18, -hw - ts * 0.08, len * 0.12, ts * 0.06);

      // Boiler dome
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(-hl + len * 0.55, -hw - ts * 0.04, len * 0.07, ts * 0.06, 0, Math.PI, 0, true);
      ctx.fill();

      // Smokestack
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-hl + len * 0.42, -hw - ts * 0.14, len * 0.07, ts * 0.12);
      ctx.fillRect(-hl + len * 0.4, -hw - ts * 0.15, len * 0.11, ts * 0.03);

      // Red accent stripe
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-hl + len * 0.02, -hw * 0.12, len * 0.6, hw * 0.24);
    }

    // Headlight glow
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = '#fef08a';
    ctx.shadowBlur = ts * 0.12;
    ctx.beginPath();
    ctx.arc(hl - ts * 0.03, 0, ts * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Wheels (4 pairs)
    if (ts >= 18) {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = Math.max(1, ts * 0.015);
      const wr = ts * 0.07;
      for (const wx of [-hl + len * 0.18, -hl + len * 0.38, hl - len * 0.28, hl - len * 0.12]) {
        for (const wy of [-hw - wr * 0.5, hw + wr * 0.5]) {
          ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          // Spoke
          ctx.beginPath(); ctx.moveTo(wx - wr * 0.6, wy); ctx.lineTo(wx + wr * 0.6, wy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx, wy - wr * 0.6); ctx.lineTo(wx, wy + wr * 0.6); ctx.stroke();
        }
      }
    }

  } else {
    // ── Passenger car ────────────────────────────────────────
    // Under-frame
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-hl, -hw - ts * 0.03, len, wid + ts * 0.06);

    // Main body
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-hl + len * 0.02, -hw, len * 0.96, wid, ts * 0.025);
    else ctx.rect(-hl + len * 0.02, -hw, len * 0.96, wid);
    ctx.fill();

    // Blue stripe
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(-hl + len * 0.02, -hw * 0.18, len * 0.96, hw * 0.36);

    if (ts >= 16) {
      // Windows
      const nw = Math.max(3, Math.floor(len / (ts * 0.22)));
      const gap = len * 0.85 / nw;
      const ww = gap * 0.55, wh = wid * 0.38;
      for (let i = 0; i < nw; i++) {
        const wx = -hl + len * 0.075 + i * gap;
        ctx.fillStyle = 'rgba(186,230,253,0.85)';
        ctx.fillRect(wx, -wh / 2, ww, wh);
      }
    }

    // Coupling connectors
    ctx.fillStyle = '#475569';
    ctx.fillRect(-hl - ts * 0.04, -hw * 0.2, ts * 0.04, hw * 0.4);
    ctx.fillRect(hl, -hw * 0.2, ts * 0.04, hw * 0.4);

    // Wheels
    if (ts >= 18) {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = Math.max(1, ts * 0.015);
      const wr = ts * 0.065;
      for (const wx of [-hl + len * 0.2, -hl + len * 0.38, hl - len * 0.38, hl - len * 0.2]) {
        for (const wy of [-hw - wr * 0.5, hw + wr * 0.5]) {
          ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  ctx.restore();
}
