import { Grid, OrbitControls, Text } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Armchair, Camera, Eye, ImageIcon, RotateCcw } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { FloorPlanOverlay as FloorPlanOverlayData, Furniture, Opening, Room, SceneData } from './types';

type ViewMode = 'walk' | 'top';

const WALL_THICKNESS = 0.14;

const fallbackScene: SceneData = {
  units: 'm',
  cameraStart: [0, 1.55, 1.35],
  scaleAssumptions: ['Fallback scene loaded because /scene.json could not be read.'],
  rooms: [
    {
      id: 'room',
      name: 'Preview Room',
      center: [0, 0],
      size: [4.6, 3.4],
      height: 2.8,
      floorMaterial: '#c9b79d',
      wallMaterial: '#f0ece4',
    },
  ],
  furniture: [
    {
      id: 'sample-sofa',
      name: 'Sample Sofa',
      roomId: 'room',
      center: [-0.9, -0.8],
      size: [2.1, 0.85, 0.75],
      color: '#6f817c',
    },
  ],
};

export default function App() {
  const [scene, setScene] = useState<SceneData>(fallbackScene);
  const [viewMode, setViewMode] = useState<ViewMode>('walk');
  const [selected, setSelected] = useState<Furniture | null>(null);

  useEffect(() => {
    fetch('/scene.json')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: SceneData) => setScene(data))
      .catch(() => setScene(fallbackScene));
  }, []);

  const providerText = scene.imageProviders?.map((provider) => provider.id).join(', ') || 'none configured';

  return (
    <main className="app">
      <Canvas camera={{ position: scene.cameraStart ?? [0, 1.55, 1.35], fov: 62 }} shadows>
        <color attach="background" args={['#101417']} />
        <ambientLight intensity={0.7} />
        <directionalLight castShadow intensity={1.4} position={[6, 8, 5]} />
        <Suspense fallback={null}>
          <InteriorScene onSelectFurniture={setSelected} scene={scene} viewMode={viewMode} />
        </Suspense>
        <Grid
          args={[30, 30]}
          cellColor="#334155"
          cellSize={0.5}
          fadeDistance={22}
          fadeStrength={2}
          position={[0, 0.01, 0]}
          sectionColor="#64748b"
          sectionSize={2}
        />
        <CameraController mode={viewMode} scene={scene} />
      </Canvas>

      <section className="hud">
        <div className="title-row">
          <Armchair size={20} />
          <div>
            <h1>Interior 3D Preview</h1>
            <p>{scene.rooms.length} rooms · {scene.furniture.length} furniture items</p>
          </div>
        </div>
        <div className="button-row">
          <button className={viewMode === 'walk' ? 'active' : ''} onClick={() => setViewMode('walk')} title="First-person camera">
            <Eye size={17} />
          </button>
          <button className={viewMode === 'top' ? 'active' : ''} onClick={() => setViewMode('top')} title="Top-down editor camera">
            <Camera size={17} />
          </button>
          <button onClick={() => window.location.reload()} title="Reload scene">
            <RotateCcw size={17} />
          </button>
        </div>
        <p className="hint">{viewMode === 'walk' ? 'WASD / arrows move. Drag to look.' : 'Drag to orbit. Wheel to zoom.'}</p>
        <div className="provider-row">
          <ImageIcon size={15} />
          <span>{providerText}</span>
        </div>
      </section>

      <section className="panel">
        <h2>{selected ? selected.name : 'Scene assumptions'}</h2>
        {selected ? (
          <p>{selected.placementAssumption || 'No placement assumption provided.'}</p>
        ) : (
          <ul>
            {(scene.scaleAssumptions || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function InteriorScene({
  scene,
  viewMode,
  onSelectFurniture,
}: {
  scene: SceneData;
  viewMode: ViewMode;
  onSelectFurniture: (item: Furniture) => void;
}) {
  const openings = scene.openings || [];

  return (
    <group>
      {viewMode === 'top' && scene.floorPlanOverlay ? <FloorPlanOverlay overlay={scene.floorPlanOverlay} /> : null}
      {scene.rooms.map((room) => (
        <RoomModel key={room.id} openings={openings.filter((opening) => opening.roomId === room.id)} room={room} />
      ))}
      {scene.furniture.map((item) => (
        <FurnitureModel key={item.id} item={item} onSelect={() => onSelectFurniture(item)} />
      ))}
    </group>
  );
}

function FloorPlanOverlay({ overlay }: { overlay: FloorPlanOverlayData }) {
  const texture = useMemo(() => {
    const loaded = new THREE.TextureLoader().load(overlay.image);
    loaded.colorSpace = THREE.SRGBColorSpace;
    return loaded;
  }, [overlay.image]);

  const [cx, cz] = overlay.center;
  const [width, depth] = overlay.size;

  return (
    <mesh position={[cx, 0.045, cz]} rotation={[-Math.PI / 2, 0, overlay.rotation || 0]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        color="#ffffff"
        depthWrite={false}
        map={texture}
        opacity={overlay.opacity ?? 0.35}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  );
}

function RoomModel({ room, openings }: { room: Room; openings: Opening[] }) {
  const [cx, cz] = room.center;
  const [width, depth] = room.size;
  const wallColor = room.wallMaterial || '#f1eee6';
  const floorColor = room.floorMaterial || '#cdbb9e';
  const wallMode = room.wallMode || 'full';
  const roomOpacity = room.opacity ?? 1;
  const wallHeight = wallMode === 'low' ? 0.58 : room.height;
  const halfHeight = wallHeight / 2;
  const transparent = roomOpacity < 1;

  const walls = wallMode === 'none'
    ? []
    : [
        { id: 'north', position: [cx, halfHeight, cz - depth / 2], size: [width, wallHeight, WALL_THICKNESS] },
        { id: 'south', position: [cx, halfHeight, cz + depth / 2], size: [width, wallHeight, WALL_THICKNESS] },
        { id: 'east', position: [cx + width / 2, halfHeight, cz], size: [WALL_THICKNESS, wallHeight, depth] },
        { id: 'west', position: [cx - width / 2, halfHeight, cz], size: [WALL_THICKNESS, wallHeight, depth] },
      ] as const;

  return (
    <group>
      <mesh receiveShadow position={[cx, 0.02, cz]}>
        <boxGeometry args={[width, 0.04, depth]} />
        <meshStandardMaterial color={floorColor} opacity={roomOpacity} roughness={0.72} transparent={transparent} />
      </mesh>
      {walls.map((wall) => (
        <mesh castShadow key={wall.id} position={wall.position as [number, number, number]}>
          <boxGeometry args={wall.size as [number, number, number]} />
          <meshStandardMaterial color={wallColor} opacity={roomOpacity} roughness={0.6} transparent={transparent} />
        </mesh>
      ))}
      {openings.map((opening, index) => (
        <OpeningMarker key={`${opening.wall}-${index}`} opening={opening} room={room} />
      ))}
      <Text color="#dbeafe" fontSize={0.16} position={[cx, 0.06, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        {room.name}
      </Text>
    </group>
  );
}

function OpeningMarker({ room, opening }: { room: Room; opening: Opening }) {
  const [cx, cz] = room.center;
  const [width, depth] = room.size;
  const color = opening.type === 'window' ? '#38bdf8' : opening.type === 'door' ? '#f59e0b' : '#22c55e';
  const horizontal = opening.wall === 'north' || opening.wall === 'south';
  const x = horizontal ? cx + opening.offset : cx + (opening.wall === 'east' ? width / 2 + 0.01 : -width / 2 - 0.01);
  const z = horizontal ? cz + (opening.wall === 'south' ? depth / 2 + 0.01 : -depth / 2 - 0.01) : cz + opening.offset;
  const markerHeight = room.wallMode === 'low' ? 0.42 : 1.85;
  const markerY = room.wallMode === 'low' ? 0.34 : 0.95;
  const markerSize: [number, number, number] = horizontal
    ? [opening.width, markerHeight, 0.04]
    : [0.04, markerHeight, opening.width];

  return (
    <mesh position={[x, markerY, z]}>
      <boxGeometry args={markerSize} />
      <meshBasicMaterial color={color} opacity={0.44} transparent />
    </mesh>
  );
}

function FurnitureModel({ item, onSelect }: { item: Furniture; onSelect: () => void }) {
  const texture = useMemo(() => {
    if (!item.image) return null;
    const loaded = new THREE.TextureLoader().load(item.image);
    loaded.colorSpace = THREE.SRGBColorSpace;
    return loaded;
  }, [item.image]);

  const [x, z] = item.center;
  const [width, depth, height] = item.size;
  const base = item.color || '#94a3b8';
  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: base, roughness: 0.56 });
    const top = texture
      ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62 })
      : new THREE.MeshStandardMaterial({ color: base, roughness: 0.56 });
    return [side, side, top, side, side, side];
  }, [base, texture]);

  return (
    <group position={[x, height / 2 + 0.05, z]} rotation={[0, item.rotation || 0, 0]}>
      <mesh castShadow onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}>
        <boxGeometry args={[width, height, depth]} />
        {materials.map((material, index) => (
          <primitive attach={`material-${index}`} key={index} object={material} />
        ))}
      </mesh>
      <Text color="#f8fafc" fontSize={0.12} position={[0, height / 2 + 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {item.name}
      </Text>
    </group>
  );
}

function CameraController({ mode, scene }: { mode: ViewMode; scene: SceneData }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const yaw = useRef(0);
  const pitch = useRef(0);

  useEffect(() => {
    if (mode === 'top') {
      camera.position.set(0, 15, 10);
      camera.lookAt(0, 0, 0.45);
      return;
    }
    const start = scene.cameraStart || [0, 1.55, 1.35];
    camera.position.set(start[0], start[1], start[2]);
    camera.lookAt(0, 1.3, 0);
  }, [camera, mode, scene.cameraStart]);

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
    const speed = 2.4 * delta;
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
    <OrbitControls enableDamping makeDefault maxDistance={32} maxPolarAngle={Math.PI / 2.05} target={[0, 0, 0.45]} />
  ) : null;
}
