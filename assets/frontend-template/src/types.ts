export type ImageProvider = {
  id: 'gpt-image-2' | 'nano-banana' | 'custom';
  mode: 'generate' | 'edit' | 'composite';
  apiKeyEnv?: string;
  endpointEnv?: string;
};

export type FloorPlanOverlay = {
  image: string;
  center: [number, number];
  size: [number, number];
  opacity?: number;
  rotation?: number;
};

export type RoomType = 'living' | 'kitchen' | 'bedroom' | 'bath' | 'balcony' | 'utility' | 'other';

export type WallMode = 'full' | 'low' | 'none';

export type Room = {
  id: string;
  name: string;
  type?: RoomType;
  wallMode?: WallMode;
  opacity?: number;
  center: [number, number];
  size: [number, number];
  height: number;
  floorMaterial?: string;
  wallMaterial?: string;
};

export type Opening = {
  roomId: string;
  wall: 'north' | 'south' | 'east' | 'west';
  type: 'door' | 'window' | 'open';
  offset: number;
  width: number;
};

export type Furniture = {
  id: string;
  name: string;
  roomId: string;
  center: [number, number];
  size: [number, number, number];
  rotation?: number;
  color?: string;
  image?: string;
  placementAssumption?: string;
};

export type SceneData = {
  units: 'm' | 'cm' | 'ft';
  cameraStart?: [number, number, number];
  floorPlanOverlay?: FloorPlanOverlay;
  scaleAssumptions?: string[];
  imageProviders?: ImageProvider[];
  rooms: Room[];
  openings?: Opening[];
  furniture: Furniture[];
};
