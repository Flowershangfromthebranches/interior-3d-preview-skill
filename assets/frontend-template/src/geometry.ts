import * as THREE from 'three';
import type {
  Point2,
  SceneData,
  SceneDiagnostics,
  StructuralStatus,
  WallGraph,
  WallLine,
  WallNode,
  WallOpening,
  WallSegment,
} from './types';

export type NormalizedWall = WallLine & {
  start: Point2;
  end: Point2;
};

export type NormalizedScene = {
  nodes: WallNode[];
  walls: NormalizedWall[];
  wallOpenings: WallOpening[];
  diagnostics: SceneDiagnostics;
};

export type WallPanel = {
  start: number;
  length: number;
  y: number;
  height: number;
};

const EPSILON = 1e-6;
const NODE_TOLERANCE = 0.08;

type SegmentPiece = WallSegment & {
  sourceSegmentIds: string[];
  sourceRanges: Record<string, [number, number]>;
};

export function normalizeScene(scene: SceneData): NormalizedScene {
  if (scene.wallGraph) {
    const nodes = scene.wallGraph.nodes;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const walls = scene.wallGraph.walls
      .map((wall) => {
        const start = nodeById.get(wall.startNodeId)?.point;
        const end = nodeById.get(wall.endNodeId)?.point;
        if (!start || !end) return null;
        return { ...wall, start, end };
      })
      .filter((wall): wall is NormalizedWall => Boolean(wall));
    const diagnostics = diagnoseGraph(nodes, walls, scene.wallOpenings || [], scene);
    return { nodes, walls, wallOpenings: scene.wallOpenings || [], diagnostics };
  }

  const { graph, wallOpenings } = graphFromSegments(scene.wallSegments || [], scene.wallOpenings || []);
  const migratedScene = { ...scene, wallGraph: graph, wallOpenings };
  return normalizeScene(migratedScene);
}

export function ensureWallGraph(scene: SceneData): SceneData {
  if (scene.wallGraph) return scene;
  const { graph, wallOpenings } = graphFromSegments(scene.wallSegments || [], scene.wallOpenings || []);
  return { ...scene, wallGraph: graph, wallOpenings };
}

export function graphToSegments(graph: WallGraph): WallSegment[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.walls.flatMap((wall) => {
    const start = nodeById.get(wall.startNodeId)?.point;
    const end = nodeById.get(wall.endNodeId)?.point;
    if (!start || !end) return [];
    return [{
      id: wall.id,
      name: wall.name,
      start,
      end,
      thickness: wall.thickness,
      height: wall.height,
      material: wall.material,
      roomIds: wall.roomIds,
      structuralStatus: wall.structuralStatus,
      demolishable: wall.demolishable,
      exterior: wall.exterior,
    }];
  });
}

export function buildWallPanels(wall: NormalizedWall, openings: WallOpening[], wallHeight: number): WallPanel[] {
  const length = wallLength(wall);
  const sorted = [...openings].sort((a, b) => a.center - b.center);
  const panels: WallPanel[] = [];
  let cursor = 0;

  for (const opening of sorted) {
    const openingStart = THREE.MathUtils.clamp(opening.center - opening.width / 2, 0, length);
    const openingEnd = THREE.MathUtils.clamp(opening.center + opening.width / 2, 0, length);
    if (openingEnd <= openingStart) continue;
    if (openingStart > cursor + EPSILON) {
      panels.push({ start: cursor, length: openingStart - cursor, y: wallHeight / 2, height: wallHeight });
    }
    if (opening.sillHeight > EPSILON) {
      panels.push({ start: openingStart, length: openingEnd - openingStart, y: opening.sillHeight / 2, height: opening.sillHeight });
    }
    const topStart = opening.sillHeight + opening.height;
    if (topStart < wallHeight - EPSILON) {
      panels.push({ start: openingStart, length: openingEnd - openingStart, y: topStart + (wallHeight - topStart) / 2, height: wallHeight - topStart });
    }
    cursor = Math.max(cursor, openingEnd);
  }

  if (cursor < length - EPSILON) {
    panels.push({ start: cursor, length: length - cursor, y: wallHeight / 2, height: wallHeight });
  }
  return panels.filter((panel) => panel.length > 0.025 && panel.height > 0.025);
}

export function wallLength(wall: Pick<WallSegment, 'start' | 'end'>) {
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  return Math.hypot(ex - sx, ez - sz);
}

export function wallAngle(wall: Pick<WallSegment, 'start' | 'end'>) {
  return Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
}

export function midpoint(wall: Pick<WallSegment, 'start' | 'end'>): Point2 {
  return [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2];
}

export function pointAlong(wall: Pick<WallSegment, 'start' | 'end'>, distance: number): Point2 {
  const length = wallLength(wall);
  if (length < EPSILON) return wall.start;
  const t = THREE.MathUtils.clamp(distance / length, 0, 1);
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * t,
    wall.start[1] + (wall.end[1] - wall.start[1]) * t,
  ];
}

export function projectPointDistance(wall: Pick<WallSegment, 'start' | 'end'>, point: Point2) {
  const length = wallLength(wall);
  if (length < EPSILON) return 0;
  const dx = (wall.end[0] - wall.start[0]) / length;
  const dz = (wall.end[1] - wall.start[1]) / length;
  return (point[0] - wall.start[0]) * dx + (point[1] - wall.start[1]) * dz;
}

export function snapPoint(point: Point2, snap: number): Point2 {
  if (!snap) return point;
  return [Math.round(point[0] / snap) * snap, Math.round(point[1] / snap) * snap];
}

function graphFromSegments(segments: WallSegment[], openings: WallOpening[]): { graph: WallGraph; wallOpenings: WallOpening[] } {
  const splitPoints = new Map<string, Point2[]>();
  for (const segment of segments) {
    splitPoints.set(segment.id, [segment.start, segment.end]);
  }

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      const intersection = segmentIntersection(a.start, a.end, b.start, b.end);
      if (!intersection) continue;
      splitPoints.get(a.id)?.push(intersection);
      splitPoints.get(b.id)?.push(intersection);
    }
  }

  for (const pointSource of segments) {
    for (const candidate of [pointSource.start, pointSource.end]) {
      for (const target of segments) {
        if (pointSource.id === target.id) continue;
        if (pointOnSegment(candidate, target.start, target.end, NODE_TOLERANCE)) {
          splitPoints.get(target.id)?.push(candidate);
        }
      }
    }
  }

  const pieces: SegmentPiece[] = [];
  for (const segment of segments) {
    const length = wallLength(segment);
    if (length < NODE_TOLERANCE) continue;
    const distances = uniqueSorted((splitPoints.get(segment.id) || [])
      .map((point) => THREE.MathUtils.clamp(projectPointDistance(segment, point), 0, length)));

    for (let index = 0; index < distances.length - 1; index += 1) {
      const startDistance = distances[index];
      const endDistance = distances[index + 1];
      if (endDistance - startDistance < NODE_TOLERANCE) continue;
      const start = pointAlong(segment, startDistance);
      const end = pointAlong(segment, endDistance);
      pieces.push({
        ...segment,
        id: distances.length > 2 ? `${segment.id}-p${index + 1}` : segment.id,
        name: segment.name,
        start,
        end,
        sourceSegmentIds: [segment.id],
        sourceRanges: { [segment.id]: [startDistance, endDistance] },
      });
    }
  }

  const mergedPieces = mergePieces(pieces);
  const nodes: WallNode[] = [];
  const nodeIds = new Map<string, string>();

  function getNodeId(point: Point2) {
    const key = pointKey(point);
    const existing = nodeIds.get(key);
    if (existing) return existing;
    const id = `n-${nodes.length + 1}`;
    nodeIds.set(key, id);
    nodes.push({ id, point: roundPoint(point), source: 'generated' });
    return id;
  }

  const walls: WallLine[] = mergedPieces.map((piece) => ({
    id: piece.id,
    name: piece.name,
    startNodeId: getNodeId(piece.start),
    endNodeId: getNodeId(piece.end),
    thickness: piece.thickness,
    height: piece.height,
    material: piece.material,
    roomIds: piece.roomIds,
    structuralStatus: piece.structuralStatus,
    demolishable: piece.demolishable,
    exterior: piece.exterior,
    sourceSegmentIds: piece.sourceSegmentIds,
  }));

  const remappedOpenings = remapOpenings(openings, mergedPieces);
  return { graph: { nodes, walls }, wallOpenings: remappedOpenings };
}

function mergePieces(pieces: SegmentPiece[]) {
  const groups = new Map<string, SegmentPiece[]>();
  for (const piece of pieces) {
    const key = segmentKey(piece.start, piece.end);
    groups.set(key, [...(groups.get(key) || []), piece]);
  }

  return [...groups.values()].map((group) => {
    const base = group[0];
    const sourceSegmentIds = [...new Set(group.flatMap((piece) => piece.sourceSegmentIds))];
    const sourceRanges = Object.assign({}, ...group.map((piece) => piece.sourceRanges));
    return {
      ...base,
      id: sourceSegmentIds.length === 1 ? base.id : `wall-${segmentKey(base.start, base.end).replace(/[|,.]/g, '-')}`,
      name: group.map((piece) => piece.name).filter(Boolean)[0] || base.id,
      structuralStatus: mergeStructuralStatus(group.map((piece) => piece.structuralStatus)),
      exterior: group.some((piece) => piece.exterior),
      demolishable: group.some((piece) => piece.demolishable),
      roomIds: [...new Set(group.flatMap((piece) => piece.roomIds || []))],
      sourceSegmentIds,
      sourceRanges,
    };
  });
}

function remapOpenings(openings: WallOpening[], pieces: SegmentPiece[]) {
  return openings.map((opening) => {
    const openingStart = opening.center - opening.width / 2;
    const openingEnd = opening.center + opening.width / 2;
    const piece = pieces.find((candidate) => {
      const range = candidate.sourceRanges[opening.wallId];
      if (!range) return false;
      return openingStart >= range[0] - NODE_TOLERANCE && openingEnd <= range[1] + NODE_TOLERANCE;
    });
    if (!piece) return opening;
    const sourceStart = piece.sourceRanges[opening.wallId][0];
    return {
      ...opening,
      wallId: piece.id,
      center: opening.center - sourceStart,
    };
  });
}

function diagnoseGraph(nodes: WallNode[], walls: NormalizedWall[], openings: WallOpening[], scene: SceneData): SceneDiagnostics {
  const duplicateWalls: string[] = [];
  const danglingNodes: string[] = [];
  const overlappingWalls: string[] = [];
  const openingErrors: string[] = [];
  const missingRoomRefs: string[] = [];
  const wallKeys = new Map<string, string>();
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  const roomIds = new Set(scene.rooms.map((room) => room.id));

  for (const wall of walls) {
    const key = segmentKey(wall.start, wall.end);
    const existing = wallKeys.get(key);
    if (existing) duplicateWalls.push(`${existing} / ${wall.id}`);
    wallKeys.set(key, wall.id);
    degrees.set(wall.startNodeId, (degrees.get(wall.startNodeId) || 0) + 1);
    degrees.set(wall.endNodeId, (degrees.get(wall.endNodeId) || 0) + 1);
    for (const roomId of wall.roomIds || []) {
      if (!roomIds.has(roomId)) missingRoomRefs.push(`${wall.id}: ${roomId}`);
    }
  }

  for (const node of nodes) {
    if ((degrees.get(node.id) || 0) <= 1) danglingNodes.push(node.id);
  }

  for (let i = 0; i < walls.length; i += 1) {
    for (let j = i + 1; j < walls.length; j += 1) {
      if (segmentKey(walls[i].start, walls[i].end) === segmentKey(walls[j].start, walls[j].end)) continue;
      if (collinearOverlap(walls[i], walls[j]) > NODE_TOLERANCE) {
        overlappingWalls.push(`${walls[i].id} / ${walls[j].id}`);
      }
    }
  }

  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  for (const opening of openings) {
    const wall = wallById.get(opening.wallId);
    if (!wall) {
      openingErrors.push(`${opening.id}: missing wall ${opening.wallId}`);
      continue;
    }
    const length = wallLength(wall);
    const height = wall.height || scene.defaultHeight || 2.8;
    if (opening.center - opening.width / 2 < -NODE_TOLERANCE || opening.center + opening.width / 2 > length + NODE_TOLERANCE) {
      openingErrors.push(`${opening.id}: outside ${opening.wallId}`);
    }
    if (opening.sillHeight + opening.height > height + NODE_TOLERANCE) {
      openingErrors.push(`${opening.id}: taller than ${opening.wallId}`);
    }
  }

  return {
    duplicateWalls,
    danglingNodes,
    overlappingWalls,
    openingErrors,
    missingRoomRefs,
  };
}

function segmentIntersection(a1: Point2, a2: Point2, b1: Point2, b2: Point2): Point2 | null {
  const x1 = a1[0];
  const y1 = a1[1];
  const x2 = a2[0];
  const y2 = a2[1];
  const x3 = b1[0];
  const y3 = b1[1];
  const x4 = b2[0];
  const y4 = b2[1];
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < EPSILON) return null;
  const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom;
  const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom;
  const point: Point2 = [px, py];
  return pointOnSegment(point, a1, a2, NODE_TOLERANCE) && pointOnSegment(point, b1, b2, NODE_TOLERANCE) ? roundPoint(point) : null;
}

function pointOnSegment(point: Point2, start: Point2, end: Point2, tolerance: number) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (length < EPSILON) return false;
  const projected = projectPointDistance({ start, end }, point);
  if (projected < -tolerance || projected > length + tolerance) return false;
  const closest = pointAlong({ start, end }, projected);
  return Math.hypot(point[0] - closest[0], point[1] - closest[1]) <= tolerance;
}

function collinearOverlap(a: Pick<WallSegment, 'start' | 'end'>, b: Pick<WallSegment, 'start' | 'end'>) {
  if (!pointOnLine(b.start, a.start, a.end) || !pointOnLine(b.end, a.start, a.end)) return 0;
  const aLength = wallLength(a);
  const b0 = THREE.MathUtils.clamp(projectPointDistance(a, b.start), 0, aLength);
  const b1 = THREE.MathUtils.clamp(projectPointDistance(a, b.end), 0, aLength);
  const start = Math.max(0, Math.min(b0, b1));
  const end = Math.min(aLength, Math.max(b0, b1));
  return Math.max(0, end - start);
}

function pointOnLine(point: Point2, start: Point2, end: Point2) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const cross = (point[0] - start[0]) * dz - (point[1] - start[1]) * dx;
  return Math.abs(cross) <= NODE_TOLERANCE;
}

function mergeStructuralStatus(statuses: StructuralStatus[]): StructuralStatus {
  if (statuses.includes('loadBearing')) return 'loadBearing';
  if (statuses.every((status) => status === 'nonLoadBearing')) return 'nonLoadBearing';
  return 'unknown';
}

function uniqueSorted(values: number[]) {
  return [...values].sort((a, b) => a - b).reduce<number[]>((result, value) => {
    if (!result.length || Math.abs(value - result[result.length - 1]) > NODE_TOLERANCE) result.push(value);
    return result;
  }, []);
}

function roundPoint(point: Point2): Point2 {
  return [Math.round(point[0] * 1000) / 1000, Math.round(point[1] * 1000) / 1000];
}

function pointKey(point: Point2) {
  return `${Math.round(point[0] / NODE_TOLERANCE)},${Math.round(point[1] / NODE_TOLERANCE)}`;
}

function segmentKey(start: Point2, end: Point2) {
  const a = pointKey(start);
  const b = pointKey(end);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
