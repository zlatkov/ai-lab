import type { GameState, PlacedBuilding, Resources } from './types';
import { ZERO_RES } from './types';
import { BUILDING_DEFS, GRID_W, GRID_H, TICKS_PER_DAY, STATION_TALENT_BONUS } from './constants';

function efficiency(state: GameState, b: PlacedBuilding): number {
  const def = BUILDING_DEFS[b.type];
  for (let dy = -1; dy <= def.size; dy++) {
    for (let dx = -1; dx <= def.size; dx++) {
      const inside = dx >= 0 && dx < def.size && dy >= 0 && dy < def.size;
      if (inside) continue;
      const tx = b.x + dx, ty = b.y + dy;
      if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) continue;
      if (state.grid[ty][tx].infra) return 1.1;
    }
  }
  return 1.0;
}

// BFS: is there a continuous railway path from (sx,sy) to within 2 tiles of (tx,ty)?
function railwayConnects(
  grid: GameState['grid'],
  sx: number, sy: number,
  tx: number, ty: number,
): boolean {
  const visited = new Set<number>();
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const key = y * GRID_W + x;
    if (visited.has(key)) continue;
    visited.add(key);
    if (Math.abs(x - tx) <= 2 && Math.abs(y - ty) <= 2) return true;
    for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      if (grid[ny][nx].infra === 'railway' && !visited.has(ny * GRID_W + nx)) {
        queue.push([nx, ny]);
      }
    }
  }
  return false;
}

// Find the city station building center tile for connectivity check
function cityStationTile(state: GameState): [number, number] | null {
  for (const b of Object.values(state.buildings)) {
    if (b.type === 'city_station') return [b.x + 1, b.y + 1];
  }
  return null;
}

export function tick(state: GameState): void {
  const buildings = Object.values(state.buildings).sort((a, b) => a.id.localeCompare(b.id));

  for (const b of buildings) {
    const def = BUILDING_DEFS[b.type];
    const eff = efficiency(state, b);
    let canRun = true;
    for (const k of Object.keys(def.consumes) as (keyof Resources)[]) {
      if (k === 'capital') continue;
      if (state.resources[k] < (def.consumes[k] ?? 0) * eff) { canRun = false; break; }
    }
    b.operational = canRun;
    if (canRun) {
      for (const k of Object.keys(def.consumes) as (keyof Resources)[]) {
        state.resources[k] -= (def.consumes[k] ?? 0) * eff;
      }
      for (const k of Object.keys(def.produces) as (keyof Resources)[]) {
        state.resources[k] += (def.produces[k] ?? 0) * eff;
      }
    }
  }

  // Railway connectivity bonus for player stations
  const cityTile = cityStationTile(state);
  if (cityTile) {
    for (const b of buildings) {
      if (b.type !== 'station' || b.builtin || !b.operational) continue;
      // Check if any railway tile is adjacent to this station
      const def = BUILDING_DEFS[b.type];
      let startRail: [number, number] | null = null;
      outer: for (let dy = -1; dy <= def.size; dy++) {
        for (let dx = -1; dx <= def.size; dx++) {
          const tx = b.x + dx, ty = b.y + dy;
          if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
          if (state.grid[ty][tx].infra === 'railway') { startRail = [tx, ty]; break outer; }
        }
      }
      if (startRail && railwayConnects(state.grid, startRail[0], startRail[1], cityTile[0], cityTile[1])) {
        state.resources.talent += STATION_TALENT_BONUS;
      }
    }
  }

  // Compute rates for display
  const rates: Resources = { ...ZERO_RES };
  for (const b of buildings) {
    if (!b.operational) continue;
    const def = BUILDING_DEFS[b.type];
    const eff = efficiency(state, b);
    for (const k of Object.keys(def.produces) as (keyof Resources)[]) {
      rates[k] += (def.produces[k] ?? 0) * eff;
    }
    for (const k of Object.keys(def.consumes) as (keyof Resources)[]) {
      rates[k] -= (def.consumes[k] ?? 0) * eff;
    }
  }
  state.rates = rates;

  state.tick++;
  if (state.tick % TICKS_PER_DAY === 0) state.day++;

  const now = Date.now();
  if (now - state.aiQueriesResetAt > 24 * 60 * 60 * 1000) {
    state.aiQueriesUsedToday = 0;
    state.aiQueriesResetAt = now;
  }
}
