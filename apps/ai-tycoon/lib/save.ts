import type { GameState } from './types';

const PREFIX = 'tycoon_save_';
const AUTO = 'tycoon_autosave';

export interface SaveMeta {
  slot: number | 'auto';
  timestamp: number;
  day: number;
  capital: number;
  buildings: number;
}

interface SerializedSave {
  version: number;
  timestamp: number;
  state: GameState;
}

export function save(state: GameState, slot: number | 'auto'): boolean {
  if (typeof window === 'undefined') return false;
  const key = slot === 'auto' ? AUTO : PREFIX + slot;
  try {
    const data: SerializedSave = { version: 1, timestamp: Date.now(), state };
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function load(slot: number | 'auto'): GameState | null {
  if (typeof window === 'undefined') return null;
  const key = slot === 'auto' ? AUTO : PREFIX + slot;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as SerializedSave;
    return data.state;
  } catch {
    return null;
  }
}

export function metaFor(slot: number | 'auto'): SaveMeta | null {
  if (typeof window === 'undefined') return null;
  const key = slot === 'auto' ? AUTO : PREFIX + slot;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as SerializedSave;
    return {
      slot,
      timestamp: data.timestamp,
      day: data.state.day,
      capital: Math.floor(data.state.resources.capital),
      buildings: Object.keys(data.state.buildings).length,
    };
  } catch {
    return null;
  }
}

export function listSaves(): SaveMeta[] {
  const out: SaveMeta[] = [];
  for (let i = 0; i < 3; i++) {
    const m = metaFor(i);
    if (m) out.push(m);
  }
  const a = metaFor('auto');
  if (a) out.push(a);
  return out;
}

export function deleteSave(slot: number | 'auto'): void {
  if (typeof window === 'undefined') return;
  const key = slot === 'auto' ? AUTO : PREFIX + slot;
  localStorage.removeItem(key);
}
