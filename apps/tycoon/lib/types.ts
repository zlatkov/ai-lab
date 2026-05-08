export type ResourceType = 'capital' | 'compute' | 'energy' | 'data' | 'talent' | 'research';

export interface Resources {
  capital: number;
  compute: number;
  energy: number;
  data: number;
  talent: number;
  research: number;
}

export const ZERO_RES: Resources = { capital: 0, compute: 0, energy: 0, data: 0, talent: 0, research: 0 };

export type BuildingType =
  | 'hq' | 'power_plant' | 'office' | 'data_center'
  | 'research_lab' | 'gpu_farm' | 'server_farm' | 'ai_lab'
  | 'station'
  | 'city_house' | 'town_hall' | 'city_market' | 'city_station' | 'city_park';

export type InfraType = 'road' | 'railway' | 'power_line';

export interface Tile {
  infra: InfraType | null;
  buildingId: string | null;
}

export interface PlacedBuilding {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  operational: boolean;
  builtin?: boolean;
}

export interface AiCommand {
  type: 'build' | 'demolish' | 'infra';
  buildingType?: BuildingType;
  infraType?: InfraType;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GameState {
  grid: Tile[][];
  buildings: Record<string, PlacedBuilding>;
  resources: Resources;
  rates: Resources;
  tick: number;
  day: number;
  speed: 0 | 1 | 2 | 5;
  aiQueriesUsedToday: number;
  aiQueriesResetAt: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface UISnapshot {
  resources: Resources;
  rates: Resources;
  day: number;
  speed: 0 | 1 | 2 | 5;
  aiQueriesLeft: number;
}
