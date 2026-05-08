import type { BuildingType, Resources } from './types';

export const GRID_W = 64;
export const GRID_H = 64;
export const TILE_SIZE = 64;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const INITIAL_CAPITAL = 2000;
export const AI_DAILY_LIMIT = 5;
export const AI_RESEARCH_COST = 20;
export const TICKS_PER_DAY = 60;

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
}

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  hq: {
    type: 'hq', name: 'HQ', icon: '🏢', color: '#1e40af',
    description: 'Your headquarters. Cannot be demolished.',
    size: 2, cost: 0,
    produces: { capital: 3 }, consumes: {},
  },
  power_plant: {
    type: 'power_plant', name: 'Power Plant', icon: '⚡', color: '#d97706',
    description: 'Generates energy to power your operations.',
    size: 2, cost: 500,
    produces: { energy: 15 }, consumes: { capital: 2 },
  },
  office: {
    type: 'office', name: 'Office', icon: '👥', color: '#0891b2',
    description: 'Recruits talent for research and AI labs.',
    size: 1, cost: 300,
    produces: { talent: 1 }, consumes: { capital: 1 },
  },
  data_center: {
    type: 'data_center', name: 'Data Center', icon: '🖥️', color: '#2563eb',
    description: 'Provides compute for AI workloads. Needs energy.',
    size: 2, cost: 1000,
    produces: { compute: 8 }, consumes: { energy: 3 },
  },
  research_lab: {
    type: 'research_lab', name: 'Research Lab', icon: '🔬', color: '#059669',
    description: 'Generates data and research points.',
    size: 2, cost: 800,
    produces: { data: 3, research: 1 }, consumes: { talent: 1, compute: 2 },
  },
  gpu_farm: {
    type: 'gpu_farm', name: 'GPU Farm', icon: '🔮', color: '#7c3aed',
    description: 'Massive compute cluster. Needs lots of energy.',
    size: 3, cost: 2500,
    produces: { compute: 20 }, consumes: { energy: 8 },
  },
  server_farm: {
    type: 'server_farm', name: 'Server Farm', icon: '💾', color: '#ea580c',
    description: 'Converts compute and data into revenue.',
    size: 2, cost: 1500,
    produces: { capital: 8 }, consumes: { compute: 4, data: 2 },
  },
  ai_lab: {
    type: 'ai_lab', name: 'AI Lab', icon: '🤖', color: '#db2777',
    description: 'Trains and deploys AI models. Peak revenue.',
    size: 3, cost: 5000,
    produces: { capital: 15, research: 2 }, consumes: { compute: 10, data: 5, talent: 2 },
  },
};

export const BUILDING_ORDER: BuildingType[] = [
  'hq', 'power_plant', 'office', 'data_center',
  'research_lab', 'gpu_farm', 'server_farm', 'ai_lab',
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
