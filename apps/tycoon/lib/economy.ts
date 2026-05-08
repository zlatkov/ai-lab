import type { GameState, PlacedBuilding, Resources } from './types';
import { ZERO_RES } from './types';
import { BUILDING_DEFS, GRID_W, GRID_H, TICKS_PER_DAY } from './constants';

function efficiency(state: GameState, b: PlacedBuilding): number {
  const def = BUILDING_DEFS[b.type];
  for (let dy = -1; dy <= def.size; dy++) {
    for (let dx = -1; dx <= def.size; dx++) {
      const inside = dx >= 0 && dx < def.size && dy >= 0 && dy < def.size;
      if (inside) continue;
      const tx = b.x + dx;
      const ty = b.y + dy;
      if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) continue;
      if (state.grid[ty][tx].infra) return 1.1;
    }
  }
  return 1.0;
}

export function tick(state: GameState): void {
  const buildings = Object.values(state.buildings).sort((a, b) => a.id.localeCompare(b.id));

  for (const b of buildings) {
    const def = BUILDING_DEFS[b.type];
    const eff = efficiency(state, b);
    let canRun = true;
    for (const k of Object.keys(def.consumes) as (keyof Resources)[]) {
      if (k === 'capital') continue;
      const need = (def.consumes[k] ?? 0) * eff;
      if (state.resources[k] < need) { canRun = false; break; }
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
