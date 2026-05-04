import { Grid, OrbitControls, Text } from '@react-three/drei';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { AlertTriangle, Camera, DoorOpen, Download, Eye, Hammer, Home, MousePointer2, Move, Plus, Ruler, RotateCcw, Save, Undo2, Upload } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  buildWallPanels,
  ensureWallGraph,
  graphToSegments,
  midpoint,
  normalizeScene,
  pointAlong,
  projectPointDistance,
  snapPoint,
  wallAngle,
  wallLength,
  type NormalizedScene,
  type NormalizedWall,
} from './geometry';
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
type MeasureMode = 'off' | 'area' | 'wall';
type AdjustSelection = { type: 'node'; nodeId: string } | { type: 'wall'; wallId: string } | { type: 'opening'; openingId: string } | null;
type SelectedItem = { type: 'wall'; wallId: string } | { type: 'wallMeasurement'; wallId: string } | { type: 'measurement'; measurementId: string } | null;
type NavigationRequest = { position: Point3; lookAt: Point3; key: number };

const DEFAULT_HEIGHT = 2.8;
const DEFAULT_THICKNESS = 0.18;
const STORAGE_KEY = 'interior-hard-renovation-scene-v4';
const SNAP_SIZE = 0.05;
const EDIT_HANDLE_Y = 3.15;

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
  const [measureMode, setMeasureMode] = useState<MeasureMode>('off');
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustSelection, setAdjustSelection] = useState<AdjustSelection>(null);
  const [addWallMode, setAddWallMode] = useState(false);
  const [calibrateMode, setCalibrateMode] = useState(false);
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [plan, setPlan] = useState<RenovationPlan>(fallbackScene.renovationPlan || emptyPlan());
  const [draftMeasurement, setDraftMeasurement] = useState<MeasurementBox | null>(null);
  const [message, setMessage] = useState('未知承重墙默认锁定。请补充结构资料后再模拟拆改。');
  const [navigationRequest, setNavigationRequest] = useState<NavigationRequest | null>(null);
  const [sceneHistory, setSceneHistory] = useState<SceneData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/scene.json')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: SceneData) => {
        const localScene = loadLocalScene();
        const nextScene = ensureWallGraph(localScene || data);
        setScene(nextScene);
        setPlan(nextScene.renovationPlan || emptyPlan());
        setLoaded(true);
        if (localScene) setMessage('已加载本地调整数据。可用“重置调整”回到 demo 原始模型。');
      })
      .catch(() => {
        const nextScene = ensureWallGraph(loadLocalScene() || fallbackScene);
        setScene(nextScene);
        setPlan(nextScene.renovationPlan || emptyPlan());
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
  }, [loaded, scene]);

  const normalized = useMemo(() => normalizeScene(scene), [scene]);
  const measurements = plan.measurementBoxes || [];
  const selectedWall = selected?.type === 'wall' ? normalized.walls.find((wall) => wall.id === selected.wallId) || null : null;
  const selectedWallMeasurement = selected?.type === 'wallMeasurement' ? normalized.walls.find((wall) => wall.id === selected.wallId) || null : null;
  const selectedMeasurement = selected?.type === 'measurement'
    ? measurements.find((item) => item.id === selected.measurementId) || null
    : null;
  const selectedWallStatus = selectedWall ? getWallStatus(selectedWall, plan) : null;
  const selectedAdjustWall = adjustSelection?.type === 'wall' ? normalized.walls.find((wall) => wall.id === adjustSelection.wallId) || null : null;
  const selectedAdjustNode = adjustSelection?.type === 'node' ? normalized.nodes.find((node) => node.id === adjustSelection.nodeId) || null : null;
  const selectedAdjustOpening = adjustSelection?.type === 'opening' ? (scene.wallOpenings || []).find((opening) => opening.id === adjustSelection.openingId) || null : null;

  const demolishedCount = plan.demolishedWallIds.length;
  const lockedCount = normalized.walls.filter((wall) => getWallStatus(wall, plan) !== 'nonLoadBearing').length;
  const diagnosticCount = normalized.diagnostics.duplicateWalls.length
    + normalized.diagnostics.danglingNodes.length
    + normalized.diagnostics.overlappingWalls.length
    + normalized.diagnostics.openingErrors.length
    + normalized.diagnostics.missingRoomRefs.length;

  function selectRoom(room: Room) {
    if (!room.navTarget) return;
    setViewMode('walk');
    setMeasureMode('off');
    setAdjustMode(false);
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

  function exportScene() {
    const payload = JSON.stringify({ ...scene, wallSegments: scene.wallGraph ? graphToSegments(scene.wallGraph) : scene.wallSegments }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scene.json';
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

  function pushSceneHistory() {
    setSceneHistory((current) => [...current.slice(-12), scene]);
  }

  function updateSceneGraph(updater: (scene: SceneData) => SceneData, history = true) {
    if (history) pushSceneHistory();
    setScene((current) => {
      const next = updater(ensureWallGraph(current));
      return next.wallGraph ? { ...next, wallSegments: graphToSegments(next.wallGraph) } : next;
    });
  }

  function undoSceneEdit() {
    setSceneHistory((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      setScene(previous);
      setMessage('已撤销上一步模型调整。');
      return current.slice(0, -1);
    });
  }

  function resetSceneAdjustments() {
    localStorage.removeItem(STORAGE_KEY);
    fetch('/scene.json')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: SceneData) => {
        const nextScene = ensureWallGraph(data);
        setScene(nextScene);
        setPlan(nextScene.renovationPlan || emptyPlan());
        setSceneHistory([]);
        setAdjustSelection(null);
        setMessage('已重置为 demo 原始模型。');
      })
      .catch(() => {
        const nextScene = ensureWallGraph(fallbackScene);
        setScene(nextScene);
        setPlan(nextScene.renovationPlan || emptyPlan());
        setMessage('已重置为 fallback 模型。');
      });
  }

  function moveNode(nodeId: string, point: Point2) {
    updateSceneGraph((current) => ({
      ...current,
      wallGraph: {
        nodes: (current.wallGraph?.nodes || []).map((node) => node.id === nodeId ? { ...node, point, source: 'manual' } : node),
        walls: current.wallGraph?.walls || [],
      },
    }), false);
  }

  function moveWall(wallId: string, delta: Point2) {
    updateSceneGraph((current) => {
      const wall = current.wallGraph?.walls.find((item) => item.id === wallId);
      if (!wall || !current.wallGraph) return current;
      const movedNodeIds = new Set([wall.startNodeId, wall.endNodeId]);
      return {
        ...current,
        wallGraph: {
          ...current.wallGraph,
          nodes: current.wallGraph.nodes.map((node) => movedNodeIds.has(node.id)
            ? { ...node, point: snapPoint([node.point[0] + delta[0], node.point[1] + delta[1]], SNAP_SIZE), source: 'manual' }
            : node),
        },
      };
    }, false);
  }

  function updateWall(wallId: string, patch: Partial<NormalizedWall>) {
    updateSceneGraph((current) => ({
      ...current,
      wallGraph: {
        nodes: current.wallGraph?.nodes || [],
        walls: (current.wallGraph?.walls || []).map((wall) => wall.id === wallId ? { ...wall, ...patch } : wall),
      },
    }));
  }

  function updateOpening(openingId: string, patch: Partial<WallOpening>) {
    updateSceneGraph((current) => ({
      ...current,
      wallOpenings: (current.wallOpenings || []).map((opening) => opening.id === openingId ? { ...opening, ...patch } : opening),
    }));
  }

  function deleteSelectedWall() {
    if (adjustSelection?.type !== 'wall') return;
    const wallId = adjustSelection.wallId;
    updateSceneGraph((current) => ({
      ...current,
      wallGraph: {
        nodes: current.wallGraph?.nodes || [],
        walls: (current.wallGraph?.walls || []).filter((wall) => wall.id !== wallId),
      },
      wallOpenings: (current.wallOpenings || []).filter((opening) => opening.wallId !== wallId),
    }));
    setAdjustSelection(null);
    setMessage('墙线已从调整模型中移除。导出的 scene.json 会保留该结果。');
  }

  function addOpeningToWall(kind: WallOpening['kind']) {
    if (!selectedAdjustWall) return;
    const length = wallLength(selectedAdjustWall);
    updateSceneGraph((current) => ({
      ...current,
      wallOpenings: [
        ...(current.wallOpenings || []),
        {
          id: `${kind}-${Date.now()}`,
          wallId: selectedAdjustWall.id,
          kind,
          label: kind === 'door' ? '新增门洞' : kind === 'window' ? '新增窗洞' : '新增通道',
          center: length / 2,
          width: kind === 'window' ? 1.2 : 0.9,
          height: kind === 'window' ? 1.1 : 2.1,
          sillHeight: kind === 'window' ? 0.9 : 0,
        },
      ],
    }));
    setMessage('已添加洞口，可拖动或在右侧输入精确尺寸。');
  }

  function addWall(start: Point2, end: Point2) {
    updateSceneGraph((current) => {
      const graph = current.wallGraph;
      if (!graph) return current;
      const startNode = { id: `n-${Date.now()}-a`, point: start, source: 'trace' as const };
      const endNode = { id: `n-${Date.now()}-b`, point: end, source: 'trace' as const };
      const wallId = `wall-${Date.now()}`;
      return {
        ...current,
        wallGraph: {
          nodes: [...graph.nodes, startNode, endNode],
          walls: [
            ...graph.walls,
            {
              id: wallId,
              name: '手动墙线',
              startNodeId: startNode.id,
              endNodeId: endNode.id,
              thickness: current.defaultWallThickness || DEFAULT_THICKNESS,
              height: current.defaultHeight || DEFAULT_HEIGHT,
              structuralStatus: 'unknown',
              exterior: false,
            },
          ],
        },
      };
    });
    setMessage('已添加手动墙线。未知结构默认锁定，不可拆。');
  }

  function handleUploadFloorPlan(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result);
      updateSceneGraph((current) => ({
        ...current,
        title: 'Uploaded Floor Plan Draft',
        floorPlanOverlay: {
          image,
          center: [0, 0],
          size: [10, 7],
          opacity: 0.42,
        },
        scaleAssumptions: [
          'Uploaded floor plan. Draw a calibration line and enter the real length before tracing walls.',
          'Unknown structural status remains locked until verified.',
        ],
      }));
      setViewMode('top');
      setAdjustMode(true);
      setCalibrateMode(true);
      setMessage('户型图已导入。请用校准模式画一条已知尺寸线并输入真实长度。');
    };
    reader.readAsDataURL(file);
  }

  return (
    <main className="app">
      <Canvas camera={{ position: scene.cameraStart ?? [0, 1.55, 1.8], fov: 62 }} shadows>
        <color attach="background" args={['#111417']} />
        <ambientLight intensity={0.78} />
        <directionalLight castShadow intensity={1.35} position={[5, 8, 4]} />
        <Suspense fallback={null}>
          <HardRenovationScene
            addWallMode={addWallMode}
            adjustMode={adjustMode}
            adjustSelection={adjustSelection}
            calibrateMode={calibrateMode}
            draftMeasurement={draftMeasurement}
            measureMode={measureMode}
            normalized={normalized}
            onAddWall={addWall}
            onCalibrated={(scale) => {
              updateSceneGraph((current) => {
                if (!current.floorPlanOverlay) return current;
                return {
                  ...current,
                  floorPlanOverlay: {
                    ...current.floorPlanOverlay,
                    size: [current.floorPlanOverlay.size[0] * scale, current.floorPlanOverlay.size[1] * scale],
                  },
                };
              });
              setCalibrateMode(false);
              setMessage('比例已校准。现在可以进入调整模式描墙、拖动墙体和门窗。');
            }}
            onBeginEdit={pushSceneHistory}
            onCommitMeasurement={commitMeasurement}
            onDraftMeasurement={setDraftMeasurement}
            onMoveNode={moveNode}
            onMoveOpening={(openingId, center) => updateOpening(openingId, { center })}
            onMoveWall={moveWall}
            onSelect={setSelected}
            onSelectAdjust={setAdjustSelection}
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
            <p>{scene.rooms.length} rooms · {normalized.walls.length} walls · {lockedCount} locked · {diagnosticCount} diagnostics</p>
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
            className={measureMode === 'wall' ? 'active' : ''}
            onClick={() => {
              setViewMode('top');
              setAdjustMode(false);
              setMeasureMode((enabled) => enabled === 'wall' ? 'off' : 'wall');
            }}
            title="Measure wall"
          >
            <Ruler size={17} />
          </button>
          <button
            className={measureMode === 'area' ? 'active' : ''}
            onClick={() => {
              setViewMode('top');
              setAdjustMode(false);
              setMeasureMode((enabled) => enabled === 'area' ? 'off' : 'area');
            }}
            title="Measure area"
          >
            <MousePointer2 size={17} />
          </button>
          <button
            className={adjustMode ? 'active' : ''}
            onClick={() => {
              setViewMode('top');
              setMeasureMode('off');
              setAdjustMode((enabled) => !enabled);
            }}
            title="Adjust model"
          >
            <Move size={17} />
          </button>
          <button className={addWallMode ? 'active' : ''} disabled={!adjustMode} onClick={() => setAddWallMode((enabled) => !enabled)} title="Trace wall">
            <Plus size={17} />
          </button>
          <button className={calibrateMode ? 'active' : ''} disabled={!adjustMode} onClick={() => setCalibrateMode((enabled) => !enabled)} title="Calibrate scale">
            <Save size={17} />
          </button>
          <button onClick={() => uploadInputRef.current?.click()} title="Upload floor plan">
            <Upload size={17} />
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
          <button onClick={exportScene} title="Export scene JSON">
            <Save size={17} />
          </button>
        </div>
        <input
          accept="image/*"
          hidden
          onChange={(event) => handleUploadFloorPlan(event.target.files?.[0])}
          ref={uploadInputRef}
          type="file"
        />
        <p className="hint">{viewMode === 'walk' ? 'WASD / arrows move. Drag to look.' : 'Top view: wall ruler clicks walls, pointer ruler drags areas, adjust mode edits geometry.'}</p>
        <p className="status-line">{message}</p>
        {diagnosticCount ? <DiagnosticsSummary diagnostics={normalized.diagnostics} /> : null}
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
        {adjustMode ? (
          <AdjustmentPanel
            diagnostics={normalized.diagnostics}
            onAddOpening={addOpeningToWall}
            onDeleteWall={deleteSelectedWall}
            onReset={resetSceneAdjustments}
            onUndo={undoSceneEdit}
            onUpdateNode={(nodeId, point) => moveNode(nodeId, snapPoint(point, SNAP_SIZE))}
            onUpdateOpening={updateOpening}
            onUpdateWall={updateWall}
            opening={selectedAdjustOpening}
            sceneHistoryCount={sceneHistory.length}
            selectedNode={selectedAdjustNode}
            selectedWall={selectedAdjustWall}
          />
        ) : selectedWall ? (
          <WallDetails
            onDemolish={demolishSelectedWall}
            onMarkNonLoadBearing={markSelectedNonLoadBearing}
            openings={(scene.wallOpenings || []).filter((opening) => opening.wallId === selectedWall.id)}
            plan={plan}
            wall={selectedWall}
            wallStatus={selectedWallStatus || 'unknown'}
          />
        ) : selectedWallMeasurement ? (
          <WallMeasurementDetails wall={selectedWallMeasurement} scene={scene} />
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
  normalized,
  viewMode,
  plan,
  selected,
  measureMode,
  adjustMode,
  adjustSelection,
  addWallMode,
  calibrateMode,
  draftMeasurement,
  onSelect,
  onSelectAdjust,
  onDraftMeasurement,
  onCommitMeasurement,
  onMoveNode,
  onMoveWall,
  onMoveOpening,
  onAddWall,
  onCalibrated,
  onBeginEdit,
}: {
  scene: SceneData;
  normalized: NormalizedScene;
  viewMode: ViewMode;
  plan: RenovationPlan;
  selected: SelectedItem;
  measureMode: MeasureMode;
  adjustMode: boolean;
  adjustSelection: AdjustSelection;
  addWallMode: boolean;
  calibrateMode: boolean;
  draftMeasurement: MeasurementBox | null;
  onSelect: (item: SelectedItem) => void;
  onSelectAdjust: (item: AdjustSelection) => void;
  onDraftMeasurement: (box: MeasurementBox | null) => void;
  onCommitMeasurement: (box: MeasurementBox) => void;
  onMoveNode: (nodeId: string, point: Point2) => void;
  onMoveWall: (wallId: string, delta: Point2) => void;
  onMoveOpening: (openingId: string, center: number) => void;
  onAddWall: (start: Point2, end: Point2) => void;
  onCalibrated: (scale: number) => void;
  onBeginEdit: () => void;
}) {
  const measurements = plan.measurementBoxes || [];

  return (
    <group>
      {viewMode === 'top' && scene.floorPlanOverlay ? <FloorPlanOverlay overlay={scene.floorPlanOverlay} /> : null}
      {scene.rooms.map((room) => (
        <RoomFloor key={room.id} room={room} />
      ))}
      {normalized.walls.map((wall) => (
        <WallModel
          isSelected={selected?.type === 'wall' && selected.wallId === wall.id}
          isMeasured={selected?.type === 'wallMeasurement' && selected.wallId === wall.id}
          key={wall.id}
          onSelect={() => onSelect(measureMode === 'wall' ? { type: 'wallMeasurement', wallId: wall.id } : { type: 'wall', wallId: wall.id })}
          openings={normalized.wallOpenings.filter((opening) => opening.wallId === wall.id)}
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
      {measureMode === 'area' && viewMode === 'top' ? (
        <MeasurementPlane
          onCommit={onCommitMeasurement}
          onDraft={onDraftMeasurement}
          scene={scene}
        />
      ) : null}
      {adjustMode && viewMode === 'top' ? (
        <AdjustmentLayer
          addWallMode={addWallMode}
          calibrateMode={calibrateMode}
          normalized={normalized}
          onAddWall={onAddWall}
          onCalibrated={onCalibrated}
          onMoveNode={onMoveNode}
          onMoveOpening={onMoveOpening}
          onMoveWall={onMoveWall}
          onBeginEdit={onBeginEdit}
          onSelect={onSelectAdjust}
          scene={scene}
          selection={adjustSelection}
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
  isMeasured,
  onSelect,
}: {
  wall: NormalizedWall;
  openings: WallOpening[];
  plan: RenovationPlan;
  scene: SceneData;
  isSelected: boolean;
  isMeasured: boolean;
  onSelect: () => void;
}) {
  const demolished = plan.demolishedWallIds.includes(wall.id);
  const status = getWallStatus(wall, plan);
  const height = wall.height || scene.defaultHeight || DEFAULT_HEIGHT;
  const thickness = wall.thickness || scene.defaultWallThickness || DEFAULT_THICKNESS;
  const materialColor = demolished ? '#ef4444' : wall.material || wallColor(status, isSelected || isMeasured);
  const opacity = demolished ? 0.14 : wall.exterior ? 0.94 : 0.86;
  const length = wallLength(wall);
  const panels = demolished
    ? [{ start: 0, length, y: 0.035, height: 0.07 }]
    : buildWallPanels(wall, openings, height);

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
      {isMeasured && !demolished ? (
        <Text color="#38bdf8" fontSize={0.14} position={[midpoint(wall)[0], height + 0.15, midpoint(wall)[1]]} rotation={[-Math.PI / 2, 0, wallAngle(wall)]}>
          {`${length.toFixed(2)}m × ${thickness.toFixed(2)}m × ${height.toFixed(2)}m`}
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
  wall: Pick<WallSegment, 'start' | 'end'>;
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

function OpeningFrame({ wall, opening, thickness }: { wall: Pick<WallSegment, 'start' | 'end'>; opening: WallOpening; thickness: number }) {
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

function AdjustmentLayer({
  normalized,
  scene,
  selection,
  addWallMode,
  calibrateMode,
  onSelect,
  onMoveNode,
  onMoveWall,
  onMoveOpening,
  onAddWall,
  onCalibrated,
  onBeginEdit,
}: {
  normalized: NormalizedScene;
  scene: SceneData;
  selection: AdjustSelection;
  addWallMode: boolean;
  calibrateMode: boolean;
  onSelect: (selection: AdjustSelection) => void;
  onMoveNode: (nodeId: string, point: Point2) => void;
  onMoveWall: (wallId: string, delta: Point2) => void;
  onMoveOpening: (openingId: string, center: number) => void;
  onAddWall: (start: Point2, end: Point2) => void;
  onCalibrated: (scale: number) => void;
  onBeginEdit: () => void;
}) {
  const pendingWallStart = useRef<Point2 | null>(null);
  const calibrationStart = useRef<Point2 | null>(null);

  return (
    <group>
      <EditPlane
        active={addWallMode || calibrateMode}
        onPoint={(point) => {
          if (calibrateMode) {
            if (!calibrationStart.current) {
              calibrationStart.current = point;
              return;
            }
            const measured = Math.hypot(point[0] - calibrationStart.current[0], point[1] - calibrationStart.current[1]);
            calibrationStart.current = null;
            const answer = window.prompt('输入这条线的真实长度，单位米');
            const realLength = answer ? Number(answer) : 0;
            if (realLength > 0 && measured > 0) onCalibrated(realLength / measured);
            return;
          }
          if (!pendingWallStart.current) {
            pendingWallStart.current = snapPoint(point, SNAP_SIZE);
            return;
          }
          onAddWall(pendingWallStart.current, snapPoint(point, SNAP_SIZE));
          pendingWallStart.current = null;
        }}
        scene={scene}
      />
      {normalized.walls.map((wall) => (
        <WallEditHandle
          key={wall.id}
          onBeginEdit={onBeginEdit}
          onMove={onMoveWall}
          onSelect={() => onSelect({ type: 'wall', wallId: wall.id })}
          selected={selection?.type === 'wall' && selection.wallId === wall.id}
          wall={wall}
        />
      ))}
      {normalized.wallOpenings.map((opening) => {
        const wall = normalized.walls.find((candidate) => candidate.id === opening.wallId);
        if (!wall) return null;
        return (
          <OpeningEditHandle
            key={opening.id}
            onBeginEdit={onBeginEdit}
            onMove={onMoveOpening}
            onSelect={() => onSelect({ type: 'opening', openingId: opening.id })}
            opening={opening}
            selected={selection?.type === 'opening' && selection.openingId === opening.id}
            wall={wall}
          />
        );
      })}
      {normalized.nodes.map((node) => (
        <NodeHandle
          key={node.id}
          node={node}
          onBeginEdit={onBeginEdit}
          onMove={onMoveNode}
          onSelect={() => onSelect({ type: 'node', nodeId: node.id })}
          selected={selection?.type === 'node' && selection.nodeId === node.id}
        />
      ))}
    </group>
  );
}

function EditPlane({ active, scene, onPoint }: { active: boolean; scene: SceneData; onPoint: (point: Point2) => void }) {
  const bounds = sceneBounds(scene);
  if (!active) return null;
  return (
    <mesh
      onClick={(event) => {
        event.stopPropagation();
        onPoint(snapPoint([event.point.x, event.point.z], SNAP_SIZE));
      }}
      position={[bounds.center[0], 0.16, bounds.center[1]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[bounds.width + 4, bounds.depth + 4]} />
      <meshBasicMaterial color="#22c55e" opacity={0.045} transparent />
    </mesh>
  );
}

function NodeHandle({
  node,
  selected,
  onSelect,
  onMove,
  onBeginEdit,
}: {
  node: { id: string; point: Point2 };
  selected: boolean;
  onSelect: () => void;
  onMove: (nodeId: string, point: Point2) => void;
  onBeginEdit: () => void;
}) {
  const dragging = useRef(false);
  return (
    <mesh
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        dragging.current = true;
        onBeginEdit();
        (event.target as Element).setPointerCapture(event.pointerId);
        onSelect();
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        event.stopPropagation();
        const point = pointOnFloor(event);
        if (point) onMove(node.id, snapPoint(point, SNAP_SIZE));
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        (event.target as Element).releasePointerCapture(event.pointerId);
      }}
      position={[node.point[0], EDIT_HANDLE_Y + 0.12, node.point[1]]}
    >
      <sphereGeometry args={[selected ? 0.115 : 0.085, 16, 16]} />
      <meshStandardMaterial color={selected ? '#fbbf24' : '#38bdf8'} emissive={selected ? '#78350f' : '#0c4a6e'} />
    </mesh>
  );
}

function WallEditHandle({
  wall,
  selected,
  onSelect,
  onMove,
  onBeginEdit,
}: {
  wall: NormalizedWall;
  selected: boolean;
  onSelect: () => void;
  onMove: (wallId: string, delta: Point2) => void;
  onBeginEdit: () => void;
}) {
  const dragging = useRef(false);
  const lastPoint = useRef<Point2 | null>(null);
  const length = wallLength(wall);
  const center = midpoint(wall);
  return (
    <mesh
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        dragging.current = true;
        lastPoint.current = pointOnFloor(event);
        onBeginEdit();
        (event.target as Element).setPointerCapture(event.pointerId);
        onSelect();
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const point = pointOnFloor(event);
        if (!point || !lastPoint.current) return;
        event.stopPropagation();
        onMove(wall.id, [point[0] - lastPoint.current[0], point[1] - lastPoint.current[1]]);
        lastPoint.current = point;
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        lastPoint.current = null;
        (event.target as Element).releasePointerCapture(event.pointerId);
      }}
      position={[center[0], EDIT_HANDLE_Y, center[1]]}
      rotation={[0, -wallAngle(wall), 0]}
    >
      <boxGeometry args={[length, 0.045, selected ? 0.16 : 0.1]} />
      <meshBasicMaterial color={selected ? '#fbbf24' : '#22d3ee'} opacity={selected ? 0.5 : 0.22} transparent />
    </mesh>
  );
}

function OpeningEditHandle({
  opening,
  wall,
  selected,
  onSelect,
  onMove,
  onBeginEdit,
}: {
  opening: WallOpening;
  wall: NormalizedWall;
  selected: boolean;
  onSelect: () => void;
  onMove: (openingId: string, center: number) => void;
  onBeginEdit: () => void;
}) {
  const dragging = useRef(false);
  const position = pointAlong(wall, opening.center);
  return (
    <mesh
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        dragging.current = true;
        onBeginEdit();
        (event.target as Element).setPointerCapture(event.pointerId);
        onSelect();
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const point = pointOnFloor(event);
        if (!point) return;
        event.stopPropagation();
        const center = THREE.MathUtils.clamp(projectPointDistance(wall, point), opening.width / 2, wallLength(wall) - opening.width / 2);
        onMove(opening.id, Math.round(center / SNAP_SIZE) * SNAP_SIZE);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        (event.target as Element).releasePointerCapture(event.pointerId);
      }}
      position={[position[0], EDIT_HANDLE_Y + 0.24, position[1]]}
      rotation={[0, -wallAngle(wall), 0]}
    >
      <boxGeometry args={[opening.width, 0.11, 0.2]} />
      <meshStandardMaterial color={selected ? '#fbbf24' : opening.kind === 'window' ? '#7dd3fc' : '#86efac'} emissive={selected ? '#78350f' : '#064e3b'} opacity={0.82} transparent />
    </mesh>
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
  wall: NormalizedWall;
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

function WallMeasurementDetails({ wall, scene }: { wall: NormalizedWall; scene: SceneData }) {
  const length = wallLength(wall);
  const height = wall.height || scene.defaultHeight || DEFAULT_HEIGHT;
  const thickness = wall.thickness || scene.defaultWallThickness || DEFAULT_THICKNESS;
  return (
    <>
      <h2>{wall.name} — 测量数据</h2>
      <dl>
        <div><dt>长度</dt><dd>{length.toFixed(2)} m</dd></div>
        <div><dt>高度</dt><dd>{height.toFixed(2)} m</dd></div>
        <div><dt>厚度</dt><dd>{thickness.toFixed(2)} m</dd></div>
        <div><dt>墙面面积</dt><dd>{(length * height).toFixed(2)} m²</dd></div>
        <div><dt>体积</dt><dd>{(length * height * thickness).toFixed(3)} m³</dd></div>
      </dl>
      <p>点击其他墙面可继续测量。关闭测量模式退出。</p>
    </>
  );
}

function AdjustmentPanel({
  selectedWall,
  selectedNode,
  opening,
  diagnostics,
  sceneHistoryCount,
  onUpdateWall,
  onUpdateNode,
  onUpdateOpening,
  onAddOpening,
  onDeleteWall,
  onUndo,
  onReset,
}: {
  selectedWall: NormalizedWall | null;
  selectedNode: { id: string; point: Point2 } | null;
  opening: WallOpening | null;
  diagnostics: NormalizedScene['diagnostics'];
  sceneHistoryCount: number;
  onUpdateWall: (wallId: string, patch: Partial<NormalizedWall>) => void;
  onUpdateNode: (nodeId: string, point: Point2) => void;
  onUpdateOpening: (openingId: string, patch: Partial<WallOpening>) => void;
  onAddOpening: (kind: WallOpening['kind']) => void;
  onDeleteWall: () => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  return (
    <>
      <h2>调整模式</h2>
      <p>拖动蓝色节点、青色墙线或绿色/蓝色洞口；输入框用于精确修正。未知结构墙仍默认锁定。</p>
      <div className="action-row">
        <button disabled={!sceneHistoryCount} onClick={onUndo}><Undo2 size={14} />撤销调整</button>
        <button onClick={onReset}><RotateCcw size={14} />重置调整</button>
      </div>
      {selectedWall ? (
        <div className="edit-card">
          <h2>{selectedWall.name}</h2>
          <NumberField label="墙厚 m" value={selectedWall.thickness || DEFAULT_THICKNESS} onChange={(value) => onUpdateWall(selectedWall.id, { thickness: value })} />
          <NumberField label="层高 m" value={selectedWall.height || DEFAULT_HEIGHT} onChange={(value) => onUpdateWall(selectedWall.id, { height: value })} />
          <label className="field-row">
            <span>结构</span>
            <select value={selectedWall.structuralStatus} onChange={(event) => onUpdateWall(selectedWall.id, { structuralStatus: event.target.value as StructuralStatus })}>
              <option value="unknown">未知</option>
              <option value="loadBearing">承重</option>
              <option value="nonLoadBearing">非承重</option>
            </select>
          </label>
          <div className="action-row">
            <button onClick={() => onAddOpening('door')}>加门洞</button>
            <button onClick={() => onAddOpening('window')}>加窗洞</button>
            <button onClick={() => onAddOpening('passage')}>加通道</button>
            <button onClick={onDeleteWall}>删除墙线</button>
          </div>
        </div>
      ) : null}
      {selectedNode ? (
        <div className="edit-card">
          <h2>节点 {selectedNode.id}</h2>
          <NumberField label="X m" value={selectedNode.point[0]} onChange={(value) => onUpdateNode(selectedNode.id, [value, selectedNode.point[1]])} />
          <NumberField label="Z m" value={selectedNode.point[1]} onChange={(value) => onUpdateNode(selectedNode.id, [selectedNode.point[0], value])} />
        </div>
      ) : null}
      {opening ? (
        <div className="edit-card">
          <h2>{opening.label || opening.kind}</h2>
          <NumberField label="中心 m" value={opening.center} onChange={(value) => onUpdateOpening(opening.id, { center: value })} />
          <NumberField label="宽度 m" value={opening.width} onChange={(value) => onUpdateOpening(opening.id, { width: value })} />
          <NumberField label="高度 m" value={opening.height} onChange={(value) => onUpdateOpening(opening.id, { height: value })} />
          <NumberField label="离地 m" value={opening.sillHeight} onChange={(value) => onUpdateOpening(opening.id, { sillHeight: value })} />
        </div>
      ) : null}
      <DiagnosticsSummary diagnostics={diagnostics} detailed />
    </>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        step="0.05"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function DiagnosticsSummary({ diagnostics, detailed }: { diagnostics: NormalizedScene['diagnostics']; detailed?: boolean }) {
  const items = [
    ['重复墙', diagnostics.duplicateWalls],
    ['孤立端点', diagnostics.danglingNodes],
    ['重叠墙', diagnostics.overlappingWalls],
    ['洞口错误', diagnostics.openingErrors],
    ['房间引用错误', diagnostics.missingRoomRefs],
  ] as const;
  const total = items.reduce((sum, [, values]) => sum + values.length, 0);
  if (!total) return null;
  return (
    <div className={detailed ? 'diagnostics detailed' : 'diagnostics'}>
      <p><AlertTriangle size={14} />模型诊断：{total} 项需要检查</p>
      {detailed ? (
        <ul>
          {items.flatMap(([label, values]) => values.map((value) => <li key={`${label}-${value}`}>{label}: {value}</li>))}
        </ul>
      ) : null}
    </div>
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

function emptyPlan(): RenovationPlan {
  return { demolishedWallIds: [], structuralOverrides: {}, measurementBoxes: [] };
}

function getWallStatus(wall: Pick<WallSegment, 'id' | 'structuralStatus'>, plan: RenovationPlan): StructuralStatus {
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

function pointOnFloor(event: ThreeEvent<PointerEvent>): Point2 | null {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  if (!event.ray.intersectPlane(plane, hit)) return null;
  return [hit.x, hit.z];
}

function loadLocalScene(): SceneData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as SceneData : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}
