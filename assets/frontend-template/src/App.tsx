import { Grid, OrbitControls, Text } from '@react-three/drei';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Camera, DoorOpen, Download, Eye, Hammer, Home, Ruler, RotateCcw, Undo2 } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type {
  FloorPlanOverlay as FloorPlanOverlayData,
  MeasurementBox,
  Point2,
  Point3,
  RenovationPlan,
  Room,
  SceneData,
  StructuralStatus,
  WallOpening,
  WallSegment,
} from './types';

type ViewMode = 'walk' | 'top';
type SelectedItem = { type: 'wall'; wallId: string } | { type: 'measurement'; measurementId: string } | null;
type NavigationRequest = { position: Point3; lookAt: Point3; key: number };

const DEFAULT_HEIGHT = 2.8;
const DEFAULT_THICKNESS = 0.18;

const fallbackScene: SceneData = {
  units: 'm',
  title: 'Hard Renovation Preview',
  cameraStart: [0, 1.55, 1.8],
  defaultHeight: DEFAULT_HEIGHT,
  defaultWallThickness: DEFAULT_THICKNESS,
  scaleAssumptions: ['Fallback scene loaded because /scene.json could not be read.'],
  rooms: [
    {
      id: 'room',
      name: '毛坯房间',
      type: 'other',
      boundary: [[-2, -1.5], [2, -1.5], [2, 1.5], [-2, 1.5]],
      navTarget: { position: [0, 1.55, 0.8], lookAt: [1, 1.35, 0] },
    },
  ],
  wallSegments: [
    { id: 'w1', name: '未知墙体', start: [-2, -1.5], end: [2, -1.5], structuralStatus: 'unknown' },
    { id: 'w2', name: '未知墙体', start: [2, -1.5], end: [2, 1.5], structuralStatus: 'unknown' },
    { id: 'w3', name: '未知墙体', start: [2, 1.5], end: [-2, 1.5], structuralStatus: 'unknown' },
    { id: 'w4', name: '未知墙体', start: [-2, 1.5], end: [-2, -1.5], structuralStatus: 'unknown' },
  ],
  wallOpenings: [],
  renovationPlan: { demolishedWallIds: [], structuralOverrides: {}, measurementBoxes: [] },
};

export default function App() {
  const [scene, setScene] = useState<SceneData>(fallbackScene);
  const [viewMode, setViewMode] = useState<ViewMode>('top');
  const [measureMode, setMeasureMode] = useState(false);
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [plan, setPlan] = useState<RenovationPlan>(fallbackScene.renovationPlan || emptyPlan());
  const [draftMeasurement, setDraftMeasurement] = useState<MeasurementBox | null>(null);
  const [message, setMessage] = useState('未知承重墙默认锁定。请补充结构资料后再模拟拆改。');
  const [navigationRequest, setNavigationRequest] = useState<NavigationRequest | null>(null);

  useEffect(() => {
    fetch('/scene.json')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: SceneData) => {
        setScene(data);
        setPlan(data.renovationPlan || emptyPlan());
      })
      .catch(() => {
        setScene(fallbackScene);
        setPlan(fallbackScene.renovationPlan || emptyPlan());
      });
  }, []);

  const measurements = plan.measurementBoxes || [];
  const selectedWall = selected?.type === 'wall' ? scene.wallSegments.find((wall) => wall.id === selected.wallId) || null : null;
  const selectedMeasurement = selected?.type === 'measurement'
    ? measurements.find((item) => item.id === selected.measurementId) || null
    : null;
  const selectedWallStatus = selectedWall ? getWallStatus(selectedWall, plan) : null;

  const demolishedCount = plan.demolishedWallIds.length;
  const lockedCount = scene.wallSegments.filter((wall) => getWallStatus(wall, plan) !== 'nonLoadBearing').length;

  function selectRoom(room: Room) {
    if (!room.navTarget) return;
    setViewMode('walk');
    setMeasureMode(false);
    setNavigationRequest({ ...room.navTarget, key: Date.now() });
    setMessage(`已跳转到 ${room.name}。WASD 可在模型内移动。`);
  }

  function markSelectedNonLoadBearing() {
    if (!selectedWall) return;
    setPlan((current) => ({
      ...current,
      structuralOverrides: {
        ...(current.structuralOverrides || {}),
        [selectedWall.id]: 'nonLoadBearing',
      },
    }));
    setMessage(`${selectedWall.name} 已标记为非承重墙，可以模拟拆除。实际施工仍需线下核验。`);
  }

  function demolishSelectedWall() {
    if (!selectedWall) return;
    const status = getWallStatus(selectedWall, plan);
    if (status !== 'nonLoadBearing') {
      setMessage(`${selectedWall.name} 当前为 ${statusLabel(status)}，需要补充结构资料并标为非承重后才能模拟拆除。`);
      return;
    }
    setPlan((current) => ({
      ...current,
      demolishedWallIds: current.demolishedWallIds.includes(selectedWall.id)
        ? current.demolishedWallIds
        : [...current.demolishedWallIds, selectedWall.id],
    }));
    setMessage(`${selectedWall.name} 已加入拆改方案。`);
  }

  function undoLastDemolition() {
    setPlan((current) => ({
      ...current,
      demolishedWallIds: current.demolishedWallIds.slice(0, -1),
    }));
    setMessage('已撤销上一步拆墙模拟。');
  }

  function resetPlan() {
    setPlan(scene.renovationPlan || emptyPlan());
    setDraftMeasurement(null);
    setSelected(null);
    setMessage('方案已重置为原始毛坯状态。');
  }

  function exportPlan() {
    const payload = JSON.stringify({ renovationPlan: plan }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'renovation-plan.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function commitMeasurement(box: MeasurementBox) {
    setPlan((current) => ({
      ...current,
      measurementBoxes: [...(current.measurementBoxes || []), box],
    }));
    setDraftMeasurement(null);
    setSelected({ type: 'measurement', measurementId: box.id });
    setMessage('测量框已保存到当前方案。');
  }

  return (
    <main className="app">
      <Canvas camera={{ position: scene.cameraStart ?? [0, 1.55, 1.8], fov: 62 }} shadows>
        <color attach="background" args={['#111417']} />
        <ambientLight intensity={0.78} />
        <directionalLight castShadow intensity={1.35} position={[5, 8, 4]} />
        <Suspense fallback={null}>
          <HardRenovationScene
            draftMeasurement={draftMeasurement}
            measureMode={measureMode}
            onCommitMeasurement={commitMeasurement}
            onDraftMeasurement={setDraftMeasurement}
            onSelect={setSelected}
            plan={plan}
            scene={scene}
            selected={selected}
            viewMode={viewMode}
          />
        </Suspense>
        <Grid
          args={[32, 32]}
          cellColor="#334155"
          cellSize={0.5}
          fadeDistance={24}
          fadeStrength={2}
          position={[0, 0.005, 0]}
          sectionColor="#64748b"
          sectionSize={2}
        />
        <CameraController mode={viewMode} navigationRequest={navigationRequest} scene={scene} />
      </Canvas>

      <section className="hud">
        <div className="title-row">
          <Home size={20} />
          <div>
            <h1>{scene.title || 'Hard Renovation Preview'}</h1>
            <p>{scene.rooms.length} rooms · {scene.wallSegments.length} walls · {lockedCount} locked</p>
          </div>
        </div>
        <div className="button-row">
          <button className={viewMode === 'walk' ? 'active' : ''} onClick={() => setViewMode('walk')} title="First-person camera">
            <Eye size={17} />
          </button>
          <button className={viewMode === 'top' ? 'active' : ''} onClick={() => setViewMode('top')} title="Top-down editor camera">
            <Camera size={17} />
          </button>
          <button
            className={measureMode ? 'active' : ''}
            onClick={() => {
              setViewMode('top');
              setMeasureMode((enabled) => !enabled);
            }}
            title="Measure area"
          >
            <Ruler size={17} />
          </button>
          <button disabled={demolishedCount === 0} onClick={undoLastDemolition} title="Undo demolition">
            <Undo2 size={17} />
          </button>
          <button onClick={resetPlan} title="Reset renovation plan">
            <RotateCcw size={17} />
          </button>
          <button onClick={exportPlan} title="Export renovation JSON">
            <Download size={17} />
          </button>
        </div>
        <p className="hint">{viewMode === 'walk' ? 'WASD / arrows move. Drag to look.' : 'Drag to orbit. Turn on ruler and drag to measure.'}</p>
        <p className="status-line">{message}</p>
      </section>

      <section className="room-menu">
        <h2>房间跳转</h2>
        <div>
          {scene.rooms.filter((room) => room.navTarget).map((room) => (
            <button key={room.id} onClick={() => selectRoom(room)}>
              {room.name}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        {selectedWall ? (
          <WallDetails
            onDemolish={demolishSelectedWall}
            onMarkNonLoadBearing={markSelectedNonLoadBearing}
            openings={(scene.wallOpenings || []).filter((opening) => opening.wallId === selectedWall.id)}
            plan={plan}
            wall={selectedWall}
            wallStatus={selectedWallStatus || 'unknown'}
          />
        ) : selectedMeasurement ? (
          <MeasurementDetails measurement={selectedMeasurement} scene={scene} />
        ) : (
          <SceneAssumptions scene={scene} />
        )}
      </section>
    </main>
  );
}

function HardRenovationScene({
  scene,
  viewMode,
  plan,
  selected,
  measureMode,
  draftMeasurement,
  onSelect,
  onDraftMeasurement,
  onCommitMeasurement,
}: {
  scene: SceneData;
  viewMode: ViewMode;
  plan: RenovationPlan;
  selected: SelectedItem;
  measureMode: boolean;
  draftMeasurement: MeasurementBox | null;
  onSelect: (item: SelectedItem) => void;
  onDraftMeasurement: (box: MeasurementBox | null) => void;
  onCommitMeasurement: (box: MeasurementBox) => void;
}) {
  const openings = scene.wallOpenings || [];
  const measurements = plan.measurementBoxes || [];

  return (
    <group>
      {viewMode === 'top' && scene.floorPlanOverlay ? <FloorPlanOverlay overlay={scene.floorPlanOverlay} /> : null}
      {scene.rooms.map((room) => (
        <RoomFloor key={room.id} room={room} />
      ))}
      {scene.wallSegments.map((wall) => (
        <WallModel
          isSelected={selected?.type === 'wall' && selected.wallId === wall.id}
          key={wall.id}
          onSelect={() => onSelect({ type: 'wall', wallId: wall.id })}
          openings={openings.filter((opening) => opening.wallId === wall.id)}
          plan={plan}
          scene={scene}
          wall={wall}
        />
      ))}
      {measurements.map((measurement) => (
        <MeasurementOverlay
          isSelected={selected?.type === 'measurement' && selected.measurementId === measurement.id}
          key={measurement.id}
          measurement={measurement}
          onSelect={() => onSelect({ type: 'measurement', measurementId: measurement.id })}
          scene={scene}
        />
      ))}
      {draftMeasurement ? <MeasurementOverlay draft measurement={draftMeasurement} scene={scene} /> : null}
      {measureMode && viewMode === 'top' ? (
        <MeasurementPlane
          onCommit={onCommitMeasurement}
          onDraft={onDraftMeasurement}
          scene={scene}
        />
      ) : null}
    </group>
  );
}

function FloorPlanOverlay({ overlay }: { overlay: FloorPlanOverlayData }) {
  const texture = useMemo(() => {
    const loaded = new THREE.TextureLoader().load(overlay.image, (textureData) => {
      if (!overlay.cropPx) return;
      const [x, y, width, height] = overlay.cropPx;
      const image = textureData.image as HTMLImageElement;
      textureData.repeat.set(width / image.width, height / image.height);
      textureData.offset.set(x / image.width, 1 - (y + height) / image.height);
      textureData.needsUpdate = true;
    });
    loaded.colorSpace = THREE.SRGBColorSpace;
    return loaded;
  }, [overlay]);

  const [cx, cz] = overlay.center;
  const [width, depth] = overlay.size;

  return (
    <mesh position={[cx, 0.045, cz]} rotation={[-Math.PI / 2, 0, overlay.rotation || 0]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        depthWrite={false}
        map={texture}
        opacity={overlay.opacity ?? 0.35}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  );
}

function RoomFloor({ room }: { room: Room }) {
  const { center, depth, width } = boundsFromBoundary(room.boundary);
  return (
    <group>
      <mesh receiveShadow position={[center[0], 0.018, center[1]]}>
        <boxGeometry args={[width, 0.035, depth]} />
        <meshStandardMaterial color={room.floorMaterial || '#d8d0bf'} roughness={0.82} />
      </mesh>
      <Text color="#e5e7eb" fontSize={0.18} position={[center[0], 0.06, center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        {room.name}
      </Text>
    </group>
  );
}

function WallModel({
  wall,
  openings,
  plan,
  scene,
  isSelected,
  onSelect,
}: {
  wall: WallSegment;
  openings: WallOpening[];
  plan: RenovationPlan;
  scene: SceneData;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const demolished = plan.demolishedWallIds.includes(wall.id);
  const status = getWallStatus(wall, plan);
  const height = wall.height || scene.defaultHeight || DEFAULT_HEIGHT;
  const thickness = wall.thickness || scene.defaultWallThickness || DEFAULT_THICKNESS;
  const materialColor = demolished ? '#ef4444' : wall.material || wallColor(status, isSelected);
  const opacity = demolished ? 0.14 : wall.exterior ? 0.94 : 0.86;
  const panels = demolished ? [{ start: 0, length: wallLength(wall), y: 0.035, height: 0.07 }] : splitWallPanels(wall, openings, height);

  return (
    <group>
      {panels.map((panel, index) => (
        <WallBox
          color={materialColor}
          height={panel.height}
          key={`${wall.id}-panel-${index}`}
          length={panel.length}
          onClick={onSelect}
          opacity={opacity}
          selected={isSelected}
          startDistance={panel.start}
          thickness={thickness}
          wall={wall}
          y={panel.y}
        />
      ))}
      {!demolished && openings.map((opening) => (
        <OpeningFrame key={opening.id} opening={opening} thickness={thickness} wall={wall} />
      ))}
      {demolished ? (
        <Text color="#fecaca" fontSize={0.16} position={[midpoint(wall)[0], 0.18, midpoint(wall)[1]]} rotation={[-Math.PI / 2, 0, wallAngle(wall)]}>
          已模拟拆除
        </Text>
      ) : null}
    </group>
  );
}

function WallBox({
  wall,
  startDistance,
  length,
  y,
  height,
  thickness,
  color,
  opacity,
  selected,
  onClick,
}: {
  wall: WallSegment;
  startDistance: number;
  length: number;
  y: number;
  height: number;
  thickness: number;
  color: string;
  opacity: number;
  selected: boolean;
  onClick?: () => void;
}) {
  if (length <= 0.03 || height <= 0.03) return null;
  const position = pointAlong(wall, startDistance + length / 2);
  return (
    <mesh
      castShadow
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      position={[position[0], y, position[1]]}
      rotation={[0, -wallAngle(wall), 0]}
    >
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial
        color={selected ? '#fbbf24' : color}
        emissive={selected ? '#78350f' : '#000000'}
        opacity={opacity}
        roughness={0.66}
        transparent={opacity < 1}
      />
    </mesh>
  );
}

function OpeningFrame({ wall, opening, thickness }: { wall: WallSegment; opening: WallOpening; thickness: number }) {
  const color = opening.kind === 'window' ? '#7dd3fc' : opening.kind === 'door' ? '#fcd34d' : '#86efac';
  const sideWidth = 0.055;
  const topY = opening.sillHeight + opening.height + 0.035;
  const centerY = opening.sillHeight + opening.height / 2;

  return (
    <group>
      <WallBox color={color} height={opening.height} length={sideWidth} opacity={0.88} startDistance={opening.center - opening.width / 2} thickness={thickness * 1.18} wall={wall} y={centerY} selected={false} />
      <WallBox color={color} height={opening.height} length={sideWidth} opacity={0.88} startDistance={opening.center + opening.width / 2 - sideWidth} thickness={thickness * 1.18} wall={wall} y={centerY} selected={false} />
      <WallBox color={color} height={0.07} length={opening.width} opacity={0.88} startDistance={opening.center - opening.width / 2} thickness={thickness * 1.18} wall={wall} y={topY} selected={false} />
      {opening.kind === 'window' ? (
        <WallBox color={color} height={0.07} length={opening.width} opacity={0.88} startDistance={opening.center - opening.width / 2} thickness={thickness * 1.18} wall={wall} y={opening.sillHeight} selected={false} />
      ) : null}
      {opening.kind === 'door' ? (
        <WallBox color="#e5e7eb" height={opening.height * 0.92} length={opening.width * 0.88} opacity={0.22} startDistance={opening.center - opening.width * 0.44} thickness={0.035} wall={wall} y={opening.height * 0.46} selected={false} />
      ) : null}
      <Text color={color} fontSize={0.12} position={[pointAlong(wall, opening.center)[0], 0.12, pointAlong(wall, opening.center)[1]]} rotation={[-Math.PI / 2, 0, wallAngle(wall)]}>
        {opening.label || opening.kind}
      </Text>
    </group>
  );
}

function MeasurementPlane({
  scene,
  onDraft,
  onCommit,
}: {
  scene: SceneData;
  onDraft: (box: MeasurementBox | null) => void;
  onCommit: (box: MeasurementBox) => void;
}) {
  const startRef = useRef<Point2 | null>(null);
  const draggingRef = useRef(false);
  const bounds = sceneBounds(scene);

  function pointFromEvent(event: ThreeEvent<PointerEvent>): Point2 {
    return [event.point.x, event.point.z];
  }

  return (
    <mesh
      onPointerDown={(event) => {
        event.stopPropagation();
        draggingRef.current = true;
        startRef.current = pointFromEvent(event);
        onDraft({ id: 'draft', start: startRef.current, end: startRef.current, height: scene.defaultHeight || DEFAULT_HEIGHT });
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current || !startRef.current) return;
        event.stopPropagation();
        onDraft({ id: 'draft', start: startRef.current, end: pointFromEvent(event), height: scene.defaultHeight || DEFAULT_HEIGHT });
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current || !startRef.current) return;
        event.stopPropagation();
        draggingRef.current = false;
        const end = pointFromEvent(event);
        const measurement = {
          id: `measure-${Date.now()}`,
          label: '框选区域',
          start: startRef.current,
          end,
          height: scene.defaultHeight || DEFAULT_HEIGHT,
        };
        startRef.current = null;
        onCommit(measurement);
      }}
      position={[bounds.center[0], 0.09, bounds.center[1]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[bounds.width + 1.5, bounds.depth + 1.5]} />
      <meshBasicMaterial color="#38bdf8" opacity={0.02} transparent />
    </mesh>
  );
}

function MeasurementOverlay({
  measurement,
  scene,
  isSelected,
  draft,
  onSelect,
}: {
  measurement: MeasurementBox;
  scene: SceneData;
  isSelected?: boolean;
  draft?: boolean;
  onSelect?: () => void;
}) {
  const dims = measurementDimensions(measurement, scene);
  return (
    <group>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.();
        }}
        position={[dims.center[0], 0.105, dims.center[1]]}
      >
        <boxGeometry args={[dims.width, 0.025, dims.depth]} />
        <meshBasicMaterial color={isSelected ? '#fbbf24' : '#38bdf8'} opacity={draft ? 0.22 : 0.16} transparent />
      </mesh>
      <Text color="#e0f2fe" fontSize={0.16} position={[dims.center[0], 0.18, dims.center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        {`${dims.width.toFixed(2)}m x ${dims.depth.toFixed(2)}m x ${dims.height.toFixed(2)}m`}
      </Text>
    </group>
  );
}

function WallDetails({
  wall,
  openings,
  wallStatus,
  plan,
  onMarkNonLoadBearing,
  onDemolish,
}: {
  wall: WallSegment;
  openings: WallOpening[];
  wallStatus: StructuralStatus;
  plan: RenovationPlan;
  onMarkNonLoadBearing: () => void;
  onDemolish: () => void;
}) {
  const demolished = plan.demolishedWallIds.includes(wall.id);
  const length = wallLength(wall);
  return (
    <>
      <h2>{wall.name}</h2>
      <dl>
        <div><dt>长度</dt><dd>{length.toFixed(2)} m</dd></div>
        <div><dt>高度</dt><dd>{(wall.height || DEFAULT_HEIGHT).toFixed(2)} m</dd></div>
        <div><dt>厚度</dt><dd>{(wall.thickness || DEFAULT_THICKNESS).toFixed(2)} m</dd></div>
        <div><dt>结构</dt><dd>{statusLabel(wallStatus)}</dd></div>
        <div><dt>状态</dt><dd>{demolished ? '已模拟拆除' : '保留'}</dd></div>
      </dl>
      <p>{wallStatus === 'nonLoadBearing' ? '该墙已被用户补充为非承重，可用于模拟拆改。' : '普通户型图无法可靠判断承重属性，补充结构资料前不可拆。'}</p>
      <div className="opening-list">
        {openings.length ? openings.map((opening) => (
          <span key={opening.id}><DoorOpen size={13} />{opening.label || opening.kind} {opening.width.toFixed(2)}m</span>
        )) : <span>无门窗洞口记录</span>}
      </div>
      <div className="action-row">
        {wallStatus !== 'nonLoadBearing' ? <button onClick={onMarkNonLoadBearing}>标为非承重</button> : null}
        <button disabled={wallStatus !== 'nonLoadBearing' || demolished} onClick={onDemolish}>
          <Hammer size={15} />模拟拆除
        </button>
      </div>
    </>
  );
}

function MeasurementDetails({ measurement, scene }: { measurement: MeasurementBox; scene: SceneData }) {
  const dims = measurementDimensions(measurement, scene);
  return (
    <>
      <h2>{measurement.label || '框选区域'}</h2>
      <dl>
        <div><dt>长</dt><dd>{dims.width.toFixed(2)} m</dd></div>
        <div><dt>宽</dt><dd>{dims.depth.toFixed(2)} m</dd></div>
        <div><dt>高</dt><dd>{dims.height.toFixed(2)} m</dd></div>
        <div><dt>面积</dt><dd>{dims.area.toFixed(2)} m²</dd></div>
        <div><dt>体积</dt><dd>{dims.volume.toFixed(2)} m³</dd></div>
      </dl>
      <p>用于预估嵌入式冰箱、柜体、设备位或局部硬装占位。最终尺寸仍需现场复尺。</p>
    </>
  );
}

function SceneAssumptions({ scene }: { scene: SceneData }) {
  return (
    <>
      <h2>工程假设</h2>
      <ul>
        {(scene.scaleAssumptions || []).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function CameraController({
  mode,
  scene,
  navigationRequest,
}: {
  mode: ViewMode;
  scene: SceneData;
  navigationRequest: NavigationRequest | null;
}) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const flight = useRef<{
    key: number;
    progress: number;
    startPosition: THREE.Vector3;
    endPosition: THREE.Vector3;
    lookAt: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    if (mode === 'top') {
      camera.position.set(0, 16, 9.5);
      camera.lookAt(0, 0, 0);
      return;
    }
    const start = scene.cameraStart || [0, 1.55, 1.8];
    camera.position.set(start[0], start[1], start[2]);
    camera.lookAt(1, 1.3, 0);
  }, [camera, mode, scene.cameraStart]);

  useEffect(() => {
    if (!navigationRequest) return;
    flight.current = {
      key: navigationRequest.key,
      progress: 0,
      startPosition: camera.position.clone(),
      endPosition: new THREE.Vector3(...navigationRequest.position),
      lookAt: new THREE.Vector3(...navigationRequest.lookAt),
    };
  }, [camera, navigationRequest]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current.add(event.key.toLowerCase());
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const pointerDown = () => {
      if (mode === 'walk') dragging.current = true;
    };
    const pointerUp = () => {
      dragging.current = false;
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragging.current || mode !== 'walk') return;
      yaw.current -= event.movementX * 0.003;
      pitch.current = THREE.MathUtils.clamp(pitch.current - event.movementY * 0.002, -0.9, 0.9);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    gl.domElement.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointermove', pointerMove);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      gl.domElement.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointermove', pointerMove);
    };
  }, [gl.domElement, mode]);

  useFrame((_, delta) => {
    if (mode !== 'walk') return;
    if (flight.current) {
      flight.current.progress = Math.min(1, flight.current.progress + delta / 0.85);
      const t = smoothstep(flight.current.progress);
      camera.position.lerpVectors(flight.current.startPosition, flight.current.endPosition, t);
      camera.lookAt(flight.current.lookAt);
      if (flight.current.progress >= 1) {
        const direction = flight.current.lookAt.clone().sub(camera.position).normalize();
        yaw.current = Math.atan2(direction.x, direction.z);
        pitch.current = Math.asin(THREE.MathUtils.clamp(direction.y, -0.9, 0.9));
        flight.current = null;
      }
      return;
    }

    const speed = 2.2 * delta;
    const forward = new THREE.Vector3(Math.sin(yaw.current), 0, Math.cos(yaw.current));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    if (keys.current.has('w') || keys.current.has('arrowup')) camera.position.addScaledVector(forward, -speed);
    if (keys.current.has('s') || keys.current.has('arrowdown')) camera.position.addScaledVector(forward, speed);
    if (keys.current.has('a') || keys.current.has('arrowleft')) camera.position.addScaledVector(right, -speed);
    if (keys.current.has('d') || keys.current.has('arrowright')) camera.position.addScaledVector(right, speed);
    camera.position.y = 1.55;
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });

  return mode === 'top' ? (
    <OrbitControls enableDamping makeDefault maxDistance={34} maxPolarAngle={Math.PI / 2.05} target={[0, 0, 0]} />
  ) : null;
}

function splitWallPanels(wall: WallSegment, openings: WallOpening[], wallHeight: number) {
  const length = wallLength(wall);
  const sorted = [...openings].sort((a, b) => a.center - b.center);
  const panels: Array<{ start: number; length: number; y: number; height: number }> = [];
  let cursor = 0;

  sorted.forEach((opening) => {
    const openingStart = THREE.MathUtils.clamp(opening.center - opening.width / 2, 0, length);
    const openingEnd = THREE.MathUtils.clamp(opening.center + opening.width / 2, 0, length);
    if (openingStart > cursor) {
      panels.push({ start: cursor, length: openingStart - cursor, y: wallHeight / 2, height: wallHeight });
    }
    if (opening.sillHeight > 0) {
      panels.push({ start: openingStart, length: openingEnd - openingStart, y: opening.sillHeight / 2, height: opening.sillHeight });
    }
    const topStart = opening.sillHeight + opening.height;
    if (topStart < wallHeight) {
      panels.push({ start: openingStart, length: openingEnd - openingStart, y: topStart + (wallHeight - topStart) / 2, height: wallHeight - topStart });
    }
    cursor = Math.max(cursor, openingEnd);
  });

  if (cursor < length) {
    panels.push({ start: cursor, length: length - cursor, y: wallHeight / 2, height: wallHeight });
  }
  return panels;
}

function emptyPlan(): RenovationPlan {
  return { demolishedWallIds: [], structuralOverrides: {}, measurementBoxes: [] };
}

function getWallStatus(wall: WallSegment, plan: RenovationPlan): StructuralStatus {
  return plan.structuralOverrides?.[wall.id] || wall.structuralStatus || 'unknown';
}

function statusLabel(status: StructuralStatus) {
  if (status === 'loadBearing') return '承重墙';
  if (status === 'nonLoadBearing') return '非承重墙';
  return '未知，需补充资料';
}

function wallColor(status: StructuralStatus, selected: boolean) {
  if (selected) return '#fbbf24';
  if (status === 'loadBearing') return '#8b949e';
  if (status === 'nonLoadBearing') return '#92b89d';
  return '#a6a19a';
}

function wallLength(wall: WallSegment) {
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  return Math.hypot(ex - sx, ez - sz);
}

function wallAngle(wall: WallSegment) {
  return Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
}

function midpoint(wall: WallSegment): Point2 {
  return [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2];
}

function pointAlong(wall: WallSegment, distance: number): Point2 {
  const length = wallLength(wall);
  if (length === 0) return wall.start;
  const t = distance / length;
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * t,
    wall.start[1] + (wall.end[1] - wall.start[1]) * t,
  ];
}

function boundsFromBoundary(boundary: Point2[]) {
  const xs = boundary.map((point) => point[0]);
  const zs = boundary.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as Point2,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

function sceneBounds(scene: SceneData) {
  const points = scene.rooms.flatMap((room) => room.boundary);
  return boundsFromBoundary(points.length ? points : [[-8, -6], [8, 6]]);
}

function measurementDimensions(measurement: MeasurementBox, scene: SceneData) {
  const width = Math.abs(measurement.end[0] - measurement.start[0]);
  const depth = Math.abs(measurement.end[1] - measurement.start[1]);
  const height = measurement.height || scene.defaultHeight || DEFAULT_HEIGHT;
  const center: Point2 = [
    (measurement.start[0] + measurement.end[0]) / 2,
    (measurement.start[1] + measurement.end[1]) / 2,
  ];
  return {
    center,
    width,
    depth,
    height,
    area: width * depth,
    volume: width * depth * height,
  };
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}
