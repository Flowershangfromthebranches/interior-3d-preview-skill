export type Point2 = [number, number];
export type Point3 = [number, number, number];

export type ImageProvider = {
  id: 'gpt-image-2' | 'nano-banana' | 'custom';
  mode: 'generate' | 'edit' | 'composite';
  apiKeyEnv?: string;
  endpointEnv?: string;
};

export type FloorPlanOverlay = {
  image: string;
  center: Point2;
  size: Point2;
  opacity?: number;
  rotation?: number;
  cropPx?: [number, number, number, number];
};

export type RoomType = 'living' | 'kitchen' | 'bedroom' | 'bath' | 'balcony' | 'utility' | 'entry' | 'closet' | 'other';

export type StructuralStatus = 'loadBearing' | 'nonLoadBearing' | 'unknown';

export type Room = {
  id: string;
  name: string;
  type?: RoomType;
  boundary: Point2[];
  height?: number;
  floorMaterial?: string;
  navTarget?: {
    position: Point3;
    lookAt: Point3;
  };
};

export type WallSegment = {
  id: string;
  name: string;
  start: Point2;
  end: Point2;
  thickness?: number;
  height?: number;
  material?: string;
  roomIds?: string[];
  structuralStatus: StructuralStatus;
  demolishable?: boolean;
  exterior?: boolean;
};

export type WallOpening = {
  id: string;
  wallId: string;
  kind: 'door' | 'window' | 'passage';
  label?: string;
  center: number;
  width: number;
  height: number;
  sillHeight: number;
  swing?: 'leftIn' | 'rightIn' | 'leftOut' | 'rightOut';
};

export type MeasurementBox = {
  id: string;
  label?: string;
  start: Point2;
  end: Point2;
  height?: number;
};

export type RenovationPlan = {
  demolishedWallIds: string[];
  structuralOverrides?: Record<string, StructuralStatus>;
  measurementBoxes?: MeasurementBox[];
  notes?: string[];
};

export type Furniture = {
  id: string;
  name: string;
  roomId: string;
  center: Point2;
  size: Point3;
  rotation?: number;
  color?: string;
  image?: string;
  placementAssumption?: string;
};

export type SceneData = {
  units: 'm' | 'cm' | 'ft';
  title?: string;
  cameraStart?: Point3;
  defaultHeight?: number;
  defaultWallThickness?: number;
  floorPlanOverlay?: FloorPlanOverlay;
  scaleAssumptions?: string[];
  imageProviders?: ImageProvider[];
  rooms: Room[];
  wallSegments: WallSegment[];
  wallOpenings?: WallOpening[];
  renovationPlan?: RenovationPlan;
  furniture?: Furniture[];
};
