import type { Game } from './game';
import { placeBuilding, placeInfraAt, demolishAt, lineTiles } from './game';
import type { AiCommand, BuildingType } from './types';
import { BUILDING_DEFS, RESOURCE_LABELS, GRID_W, GRID_H } from './constants';

export interface CommandResult {
  ok: boolean;
  msg: string;
}

const VALID_BUILDINGS: BuildingType[] = ['hq','power_plant','office','data_center','research_lab','gpu_farm','server_farm','ai_lab'];

export function executeCommands(game: Game, commands: AiCommand[]): CommandResult[] {
  const out: CommandResult[] = [];
  for (const c of commands) out.push(executeCommand(game, c));
  game.emitUI();
  return out;
}

function executeCommand(game: Game, cmd: AiCommand): CommandResult {
  if (cmd.type === 'build') {
    if (!cmd.buildingType || !VALID_BUILDINGS.includes(cmd.buildingType)) {
      return { ok: false, msg: 'Invalid buildingType' };
    }
    if (cmd.buildingType === 'hq') return { ok: false, msg: 'Cannot build a second HQ' };
    const r = placeBuilding(game.state, cmd.buildingType, cmd.x, cmd.y);
    return {
      ok: r.ok,
      msg: r.ok
        ? `Built ${BUILDING_DEFS[cmd.buildingType].name} at (${cmd.x},${cmd.y})`
        : (r.reason ?? 'Build failed'),
    };
  }
  if (cmd.type === 'demolish') {
    const r = demolishAt(game.state, cmd.x, cmd.y);
    return { ok: r.ok, msg: r.ok ? `Demolished (${cmd.x},${cmd.y})` : (r.reason ?? 'Failed') };
  }
  if (cmd.type === 'infra') {
    if (!cmd.infraType || !['road','railway','power_line'].includes(cmd.infraType)) {
      return { ok: false, msg: 'Invalid infraType' };
    }
    const tiles: Array<[number, number]> = (cmd.x2 !== undefined && cmd.y2 !== undefined)
      ? lineTiles(cmd.x, cmd.y, cmd.x2, cmd.y2)
      : [[cmd.x, cmd.y]];
    let placed = 0;
    for (const [tx, ty] of tiles) {
      if (placeInfraAt(game.state, cmd.infraType, tx, ty)) placed++;
    }
    return { ok: placed > 0, msg: `Placed ${placed} ${cmd.infraType} tile${placed === 1 ? '' : 's'}` };
  }
  return { ok: false, msg: 'Unknown command type' };
}

export function parseCommands(text: string): AiCommand[] {
  const m = text.match(/<commands>([\s\S]*?)<\/commands>/i);
  if (!m) return [];
  try {
    let body = m[1].trim();
    body = body.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid);
  } catch {
    return [];
  }
}

function isValid(c: unknown): c is AiCommand {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  if (!['build','demolish','infra'].includes(o.type as string)) return false;
  if (typeof o.x !== 'number' || typeof o.y !== 'number') return false;
  if (o.x < 0 || o.x >= GRID_W || o.y < 0 || o.y >= GRID_H) return false;
  return true;
}

export function stripCommands(text: string): string {
  return text.replace(/<commands>[\s\S]*?<\/commands>/gi, '').trim();
}

export function summarizeGameState(game: Game): string {
  const s = game.state;
  const buildings = Object.values(s.buildings)
    .map(b => `${b.type} at (${b.x},${b.y}) [${b.operational ? 'on' : 'idle'}]`)
    .join(', ') || 'none';
  const res = Object.entries(s.resources)
    .map(([k, v]) => `${RESOURCE_LABELS[k]}: ${Math.floor(v)} (${(s.rates[k as keyof typeof s.rates] >= 0 ? '+' : '')}${s.rates[k as keyof typeof s.rates].toFixed(1)}/s)`)
    .join(', ');
  return `Day ${s.day}. Resources: ${res}. Buildings: ${buildings}. Grid: ${GRID_W}x${GRID_H}.`;
}
