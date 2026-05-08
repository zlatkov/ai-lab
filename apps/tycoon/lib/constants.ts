import type { BuildingType, Resources } from './types';

export const GRID_W = 64;
export const GRID_H = 64;
export const TILE_SIZE = 64;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const CITY_WIDTH = 10;       // columns 0-9 are the pre-built city
export const PLAYER_START_X = 12;   // player HQ placed here
export const INITIAL_CAPITAL = 8000;
export const AI_DAILY_LIMIT = 5;
export const AI_RESEARCH_COST = 20;
export const TICKS_PER_DAY = 60;
export const STATION_TALENT_BONUS = 5; // talent/s when station connected to city by railway

export interface BuildingDef {
  type: BuildingType;
  name: string;
  description: string;
  icon: string;
  color: string;
  size: number;
  cost: number;
  produces: Partial<Resources>;
  consumes: Partial<Resources>;
  builtin?: boolean;
}

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  // ── Player buildings ──────────────────────────────────────────────────
  hq: {
    type: 'hq', name: 'HQ', icon: '🏛️', color: '#1e3a5f',
    description: 'Your headquarters. Cannot be demolished.',
    size: 2, cost: 0,
    produces: { capital: 3 }, consumes: {},
  },
  power_plant: {
    type: 'power_plant', name: 'Power Plant', icon: '🏭', color: '#92400e',
    description: 'Generates energy. Needs fuel (capital).',
    size: 2, cost: 500,
    produces: { energy: 15 }, consumes: { capital: 2 },
  },
  office: {
    type: 'office', name: 'Office', icon: '🏢', color: '#164e63',
    description: 'Recruits local talent for your operation.',
    size: 1, cost: 300,
    produces: { talent: 1 }, consumes: { capital: 1 },
  },
  data_center: {
    type: 'data_center', name: 'Data Center', icon: '🖥️', color: '#1e40af',
    description: 'Provides compute for AI workloads. Requires energy.',
    size: 2, cost: 1000,
    produces: { compute: 8 }, consumes: { energy: 3 },
  },
  research_lab: {
    type: 'research_lab', name: 'Research Lab', icon: '🔭', color: '#065f46',
    description: 'Generates data and research points.',
    size: 2, cost: 800,
    produces: { data: 3, research: 1 }, consumes: { talent: 1, compute: 2 },
  },
  gpu_farm: {
    type: 'gpu_farm', name: 'GPU Farm', icon: '⚙️', color: '#4c1d95',
    description: 'Massive compute cluster. Consumes lots of energy.',
    size: 3, cost: 2500,
    produces: { compute: 20 }, consumes: { energy: 8 },
  },
  server_farm: {
    type: 'server_farm', name: 'Server Farm', icon: '📡', color: '#7c2d12',
    description: 'Monetizes compute and data into revenue.',
    size: 2, cost: 1500,
    produces: { capital: 8 }, consumes: { compute: 4, data: 2 },
  },
  ai_lab: {
    type: 'ai_lab', name: 'AI Lab', icon: '🧠', color: '#831843',
    description: 'Trains and deploys AI models. Peak revenue.',
    size: 3, cost: 5000,
    produces: { capital: 15, research: 2 }, consumes: { compute: 10, data: 5, talent: 2 },
  },
  station: {
    type: 'station', name: 'Station', icon: '🚉', color: '#374151',
    description: 'Train station. Connect to the city via railway for +5 Talent/s.',
    size: 2, cost: 800,
    produces: { talent: 2 }, consumes: { capital: 1 },
  },
  // ── City buildings (builtin, cannot be demolished) ────────────────────
  city_house: {
    type: 'city_house', name: 'House', icon: '🏠', color: '#d4a96a',
    description: 'Residential house. Provides workers.',
    size: 1, cost: 0, builtin: true,
    produces: { talent: 0.2 }, consumes: {},
  },
  town_hall: {
    type: 'town_hall', name: 'Town Hall', icon: '🏛️', color: '#6b7280',
    description: 'The city\'s administrative center.',
    size: 2, cost: 0, builtin: true,
    produces: { talent: 0.5 }, consumes: {},
  },
  city_market: {
    type: 'city_market', name: 'Market', icon: '🏪', color: '#b45309',
    description: 'City market. Generates passive income.',
    size: 2, cost: 0, builtin: true,
    produces: { capital: 0.3 }, consumes: {},
  },
  city_station: {
    type: 'city_station', name: 'City Station', icon: '🚉', color: '#374151',
    description: 'The city\'s train station. Connect your station with railway.',
    size: 2, cost: 0, builtin: true,
    produces: { talent: 2 }, consumes: {},
  },
  city_park: {
    type: 'city_park', name: 'Park', icon: '🌳', color: '#166534',
    description: 'Green park. Makes residents happy.',
    size: 2, cost: 0, builtin: true,
    produces: {}, consumes: {},
  },
};

// What appears in the player build panel (in order)
export const PLAYER_BUILDING_ORDER: BuildingType[] = [
  'power_plant', 'office', 'data_center', 'research_lab',
  'gpu_farm', 'server_farm', 'ai_lab', 'station',
];

export const INFRA_COST: Record<string, number> = {
  road: 50,
  railway: 150,
  power_line: 30,
};

export const INFRA_LABEL: Record<string, string> = {
  road: '🛣️ Road',
  railway: '🚂 Railway',
  power_line: '🔌 Power Line',
};

export const RESOURCE_ICONS: Record<string, string> = {
  capital: '💰', compute: '🖥️', energy: '⚡', data: '📊', talent: '👥', research: '🔬',
};

export const RESOURCE_LABELS: Record<string, string> = {
  capital: 'Capital', compute: 'Compute', energy: 'Energy',
  data: 'Data', talent: 'Talent', research: 'Research',
};

export const CHEAP_MODELS = [
  { id: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B ($0.04/1M)' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat ($0.07/1M)' },
  { id: 'google/gemma-3-4b-it:free', label: 'Gemma 3 4B (free)' },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B (free)' },
];
