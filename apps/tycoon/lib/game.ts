import type {
  GameState, BuildingType, InfraType, PlacedBuilding, Tile, Camera, UISnapshot, Resources,
} from './types';
import { ZERO_RES } from './types';
import {
  BUILDING_DEFS, GRID_W, GRID_H, TILE_SIZE, MIN_ZOOM, MAX_ZOOM,
  INITIAL_CAPITAL, INFRA_COST, AI_DAILY_LIMIT,
} from './constants';
import { tick } from './economy';
import { Renderer } from './renderer';
import { InputHandler } from './input';
import { save, load } from './save';

function makeGrid(): Tile[][] {
  const g: Tile[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_W; x++) row.push({ infra: null, buildingId: null });
    g.push(row);
  }
  return g;
}

export function createInitialState(): GameState {
  const state: GameState = {
    grid: makeGrid(),
    buildings: {},
    resources: { ...ZERO_RES, capital: INITIAL_CAPITAL },
    rates: { ...ZERO_RES },
    tick: 0,
    day: 1,
    speed: 1,
    aiQueriesUsedToday: 0,
    aiQueriesResetAt: Date.now(),
  };
  placeBuilding(state, 'hq', Math.floor(GRID_W / 2) - 1, Math.floor(GRID_H / 2) - 1);
  return state;
}

export function canPlaceBuilding(state: GameState, type: BuildingType, x: number, y: number): boolean {
  const def = BUILDING_DEFS[type];
  if (x < 0 || y < 0 || x + def.size > GRID_W || y + def.size > GRID_H) return false;
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      if (state.grid[y + dy][x + dx].buildingId) return false;
    }
  }
  return true;
}

export function placeBuilding(
  state: GameState, type: BuildingType, x: number, y: number,
): { ok: boolean; reason?: string; building?: PlacedBuilding } {
  const def = BUILDING_DEFS[type];
  if (!canPlaceBuilding(state, type, x, y)) return { ok: false, reason: 'Cannot place there' };
  if (def.cost > state.resources.capital) {
    return { ok: false, reason: `Need $${def.cost}, have $${Math.floor(state.resources.capital)}` };
  }
  const id = `b${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
  const b: PlacedBuilding = { id, type, x, y, operational: true };
  state.buildings[id] = b;
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      state.grid[y + dy][x + dx].buildingId = id;
      state.grid[y + dy][x + dx].infra = null;
    }
  }
  state.resources.capital -= def.cost;
  return { ok: true, building: b };
}

export function demolishAt(state: GameState, x: number, y: number): { ok: boolean; reason?: string } {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return { ok: false, reason: 'Out of bounds' };
  const t = state.grid[y][x];
  if (!t.buildingId) {
    if (t.infra) {
      t.infra = null;
      return { ok: true };
    }
    return { ok: false, reason: 'Nothing to demolish' };
  }
  const b = state.buildings[t.buildingId];
  if (!b) return { ok: false, reason: 'Building not found' };
  if (b.type === 'hq') return { ok: false, reason: 'Cannot demolish HQ' };
  const def = BUILDING_DEFS[b.type];
  state.resources.capital += Math.floor(def.cost * 0.5);
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      state.grid[b.y + dy][b.x + dx].buildingId = null;
    }
  }
  delete state.buildings[b.id];
  return { ok: true };
}

export function placeInfraAt(state: GameState, type: InfraType, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  const t = state.grid[y][x];
  if (t.buildingId) return false;
  if (t.infra === type) return false;
  const cost = INFRA_COST[type];
  if (state.resources.capital < cost) return false;
  state.resources.capital -= cost;
  t.infra = type;
  return true;
}

export function lineTiles(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // Safety cap
  for (let i = 0; i < 200; i++) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx)  { err += dx; y += sy; }
  }
  return out;
}

export type BuildMode =
  | { kind: 'building'; type: BuildingType }
  | { kind: 'infra'; type: InfraType }
  | { kind: 'demolish' }
  | null;

export class Game {
  state: GameState;
  camera: Camera;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  renderer: Renderer;
  input: InputHandler;

  buildMode: BuildMode = null;
  hover: { x: number; y: number } | null = null;
  selected: PlacedBuilding | null = null;

  onUIUpdate: (s: UISnapshot) => void = () => {};
  onSelect: (b: PlacedBuilding | null) => void = () => {};
  onMessage: (msg: string) => void = () => {};
  onModeChange: (m: BuildMode) => void = () => {};

  private rafId: number | null = null;
  private lastTime = 0;
  private tickAcc = 0;
  private autoSaveAcc = 0;

  constructor(canvas: HTMLCanvasElement, initial?: GameState) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.state = initial ?? createInitialState();
    this.camera = { x: GRID_W / 2, y: GRID_H / 2, zoom: 1 };
    this.renderer = new Renderer(this);
    this.input = new InputHandler(this);
    this.input.attach();
  }

  start() {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
    this.emitUI();
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.input.detach();
  }

  private loop = () => {
    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    if (this.state.speed > 0) {
      this.tickAcc += dt * this.state.speed;
      while (this.tickAcc >= 1000) {
        this.tickAcc -= 1000;
        tick(this.state);
        this.emitUI();
      }
    }

    this.autoSaveAcc += dt;
    if (this.autoSaveAcc > 30000) {
      this.autoSaveAcc = 0;
      save(this.state, 'auto');
    }

    this.renderer.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  emitUI() {
    this.onUIUpdate({
      resources: { ...this.state.resources },
      rates: { ...this.state.rates },
      day: this.state.day,
      speed: this.state.speed,
      aiQueriesLeft: AI_DAILY_LIMIT - this.state.aiQueriesUsedToday,
    });
  }

  setSpeed(speed: 0 | 1 | 2 | 5) {
    this.state.speed = speed;
    this.emitUI();
  }

  togglePause() {
    this.setSpeed(this.state.speed === 0 ? 1 : 0);
  }

  setBuildMode(mode: BuildMode) {
    this.buildMode = mode;
    if (mode) {
      this.selected = null;
      this.onSelect(null);
    }
    this.onModeChange(mode);
  }

  selectAt(x: number, y: number) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
    const t = this.state.grid[y][x];
    if (t.buildingId) {
      const b = this.state.buildings[t.buildingId];
      this.selected = b;
      this.onSelect(b);
    } else {
      this.selected = null;
      this.onSelect(null);
    }
  }

  tryPlaceBuilding(x: number, y: number) {
    if (this.buildMode?.kind !== 'building') return;
    const r = placeBuilding(this.state, this.buildMode.type, x, y);
    if (!r.ok && r.reason) this.onMessage(r.reason);
    this.emitUI();
  }

  tryPlaceInfra(x: number, y: number) {
    if (this.buildMode?.kind !== 'infra') return;
    placeInfraAt(this.state, this.buildMode.type, x, y);
    this.emitUI();
  }

  tryDemolish(x: number, y: number) {
    const r = demolishAt(this.state, x, y);
    if (!r.ok && r.reason) this.onMessage(r.reason);
    this.emitUI();
  }

  zoomBy(factor: number, anchor?: [number, number]) {
    const oldZ = this.camera.zoom;
    const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZ * factor));
    if (newZ === oldZ) return;
    if (anchor) {
      const [ax, ay] = anchor;
      const oldTs = TILE_SIZE * oldZ;
      const wx = (ax - this.canvas.width / 2) / oldTs + this.camera.x;
      const wy = (ay - this.canvas.height / 2) / oldTs + this.camera.y;
      const newTs = TILE_SIZE * newZ;
      this.camera.x = wx - (ax - this.canvas.width / 2) / newTs;
      this.camera.y = wy - (ay - this.canvas.height / 2) / newTs;
    }
    this.camera.zoom = newZ;
  }

  panBy(dx: number, dy: number) {
    this.camera.x = Math.max(-5, Math.min(GRID_W + 5, this.camera.x + dx));
    this.camera.y = Math.max(-5, Math.min(GRID_H + 5, this.camera.y + dy));
  }

  screenToTile(sx: number, sy: number): [number, number] {
    const ts = TILE_SIZE * this.camera.zoom;
    const wx = (sx - this.canvas.width / 2) / ts + this.camera.x;
    const wy = (sy - this.canvas.height / 2) / ts + this.camera.y;
    return [Math.floor(wx), Math.floor(wy)];
  }

  saveTo(slot: number | 'auto'): boolean { return save(this.state, slot); }
  loadFrom(slot: number | 'auto'): boolean {
    const s = load(slot);
    if (!s) return false;
    this.state = s;
    this.selected = null;
    this.buildMode = null;
    this.emitUI();
    this.onSelect(null);
    this.onModeChange(null);
    return true;
  }

  reset() {
    this.state = createInitialState();
    this.camera = { x: GRID_W / 2, y: GRID_H / 2, zoom: 1 };
    this.selected = null;
    this.buildMode = null;
    this.emitUI();
    this.onSelect(null);
    this.onModeChange(null);
  }

  centerOn(x: number, y: number) {
    this.camera.x = x;
    this.camera.y = y;
  }
}
