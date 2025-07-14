import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";
import Model from "./Model";
import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { ModelState } from "./types";

interface SceneWrapperProps {
  topDown: boolean;
  models: ModelState[];
  setModels: React.Dispatch<React.SetStateAction<ModelState[]>>;
  selectedModelIndex: number | null;
  setSelectedModelIndex: React.Dispatch<React.SetStateAction<number | null>>;
}

const FLOOR_SIZE = 20;
const FLOOR_HALF = FLOOR_SIZE / 2;

const EnhancedLighting = () => (
  <>
    <ambientLight intensity={0.1} />
    <directionalLight
      castShadow
      position={[10, 10, 5]}
      intensity={2}
      shadow-mapSize-width={4096}
      shadow-mapSize-height={4096}
      shadow-bias={-0.0005}
    />
    <directionalLight position={[-5, 5, -5]} intensity={0.3} />
    <hemisphereLight color={"#ffffff"} groundColor={"#444444"} intensity={0.4} />
    <ContactShadows
      position={[0, 0, 0]}
      opacity={0.75}
      scale={20}
      blur={1.5}
      far={10}
    />
  </>
);

type ModelRefEntry = {
  mesh: THREE.Object3D;
  obb: OBB;
  originalHalfSize: THREE.Vector3;
  localCenter: THREE.Vector3;
};

function getRotationMatrixFromObject(mesh: THREE.Object3D): THREE.Matrix3 {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.matrixWorld.decompose(position, quaternion, scale);
  const rotMatrix4 = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
  return new THREE.Matrix3().setFromMatrix4(rotMatrix4);
}

function getWorldCenter(mesh: THREE.Object3D, localCenter: THREE.Vector3) {
  return localCenter.clone().applyMatrix4(mesh.matrixWorld);
}

function Cameras({ topDown }: { topDown: boolean }) {
  const { size } = useThree();
  const aspect = size.width / size.height;

  return topDown ? (
    <OrthographicCamera
      makeDefault
      position={[0, 10, 0]}
      up={[0, 0, 1]}
      left={-aspect * 10}
      right={aspect * 10}
      top={10}
      bottom={-10}
      near={0.1}
      far={100}
      zoom={4}
    />
  ) : (
    <PerspectiveCamera
      makeDefault
      position={[5, 5, 5]}
      up={[0, 1, 0]}
      fov={50}
      near={0.1}
      far={1000}
    />
  );
}

const SceneWrapper = forwardRef(function SceneWrapper(
  {
    topDown,
    models,
    setModels,
    selectedModelIndex,
    setSelectedModelIndex,
  }: SceneWrapperProps,
  ref
) {
  const modelRefs = useRef<(ModelRefEntry | null)[]>([]);
  const pointer = useRef({ x: 0, y: 0, xDelta: 0, yDelta: 0 });
  const raycaster = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersection = useRef(new THREE.Vector3());
  const dragOffset = useRef(new THREE.Vector3());
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [savingCount, setSavingCount] = useState(0);
  const savingCountRef = useRef(0);
  const isSaving = savingCount > 0;
  const rotationTargets = useRef<(number | null)[]>([]);
  const unsavedModelsRef = useRef<Set<number>>(new Set());

  const incrementSavingCount = () => {
    savingCountRef.current++;
    setSavingCount(savingCountRef.current);
  };

  const decrementSavingCount = () => {
    savingCountRef.current = Math.max(0, savingCountRef.current - 1);
    setSavingCount(savingCountRef.current);
  };

  

  const saveModelIfNeeded = async (index: number) => {
    if (!unsavedModelsRef.current.has(index)) return;
    const model = models[index];
    if (!model) return;
    incrementSavingCount();
    try {
      const docRef = doc(db, "models", model.id);
      await setDoc(docRef, {
        path: model.path,
        position: model.position,
        rotation: model.rotation,
      });
      unsavedModelsRef.current.delete(index);
    } catch (err) {
      console.error("Error saving model state:", err);
    } finally {
      decrementSavingCount();
    }
  };

  const updateModelState = (index: number, updates: Partial<ModelState>) => {
    setModels((prev) => {
      const newModels = [...prev];
      const model = { ...newModels[index], ...updates };
      newModels[index] = model;
      unsavedModelsRef.current.add(index);
      return newModels;
    });
  };

  const getUpdatedOBB = (entry: ModelRefEntry) => {
    const obb = entry.obb.clone();
    const worldCenter = getWorldCenter(entry.mesh, entry.localCenter);
    obb.center.copy(worldCenter);
    obb.halfSize.copy(entry.originalHalfSize);
    obb.rotation.copy(getRotationMatrixFromObject(entry.mesh));
    return obb;
  };

  useImperativeHandle(ref, () => ({
    safeUpdateModelTransform: (
      index: number,
      updates: Partial<{ position: [number, number, number]; rotation: [number, number, number] }>
    ) => {
      if (index < 0 || index >= models.length) return false;
      const entry = modelRefs.current[index];
      if (!entry) return false;

      const mesh = entry.mesh;
      const oldPosition = mesh.position.clone();
      const oldRotation = mesh.rotation.clone();

      if (updates.position) mesh.position.set(...updates.position);
      if (updates.rotation) mesh.rotation.set(...updates.rotation);
      mesh.updateMatrixWorld(true);

      const updatedOBB = getUpdatedOBB(entry);
      const collision = modelRefs.current.some((r, i) => {
        if (!r || i === index) return false;
        const otherOBB = getUpdatedOBB(r);
        return updatedOBB.intersectsOBB(otherOBB);
      });

      if (collision) {
        mesh.position.copy(oldPosition);
        mesh.rotation.copy(oldRotation);
        mesh.updateMatrixWorld(true);
        return false;
      } else {
        updateModelState(index, updates);
        return true;
      }
    },
  }));

  const previousSelectedIndex = useRef<number | null>(null);

  useEffect(() => {
    async function saveOnSelectionChange() {
      if (
        previousSelectedIndex.current !== null &&
        previousSelectedIndex.current !== selectedModelIndex
      ) {
        await saveModelIfNeeded(previousSelectedIndex.current);
        rotationTargets.current[previousSelectedIndex.current] = null;
      }
      previousSelectedIndex.current = selectedModelIndex;
    }
    saveOnSelectionChange();
  }, [selectedModelIndex]);

  useEffect(() => {
    return () => {
      unsavedModelsRef.current.forEach((index) => {
        saveModelIfNeeded(index);
      });
    };
  }, []);

  function DragControls() {
    const { camera, gl } = useThree();

    useFrame(() => {
      if (camera.position.y < 0.1) camera.position.y = 0.1;
    });

    useFrame(() => {
      if (selectedModelIndex === null) return;
      const entry = modelRefs.current[selectedModelIndex];
      if (!entry) return;
      const mesh = entry.mesh;

      raycaster.current.setFromCamera(
        new THREE.Vector2(pointer.current.x, pointer.current.y),
        camera
      );
      raycaster.current.ray.intersectPlane(plane.current, intersection.current);

      if (dragging) {
        const from = mesh.position.clone();
        const to = intersection.current.clone().add(dragOffset.current);
        const delta = to.clone().sub(from);
        const newPos = from.clone();

        mesh.position.set(newPos.x + delta.x, newPos.y, newPos.z);
        mesh.updateMatrixWorld(true);
        const obbX = getUpdatedOBB(entry);
        const hitX = modelRefs.current.some(
          (r, j) => r && j !== selectedModelIndex && obbX.intersectsOBB(getUpdatedOBB(r))
        );
        if (!hitX) newPos.x += delta.x;

        mesh.position.set(newPos.x, newPos.y, newPos.z + delta.z);
        mesh.updateMatrixWorld(true);
        const obbZ = getUpdatedOBB(entry);
        const hitZ = modelRefs.current.some(
          (r, j) => r && j !== selectedModelIndex && obbZ.intersectsOBB(getUpdatedOBB(r))
        );
        if (!hitZ) newPos.z += delta.z;

        newPos.x = Math.min(FLOOR_HALF, Math.max(-FLOOR_HALF, newPos.x));
        newPos.z = Math.min(FLOOR_HALF, Math.max(-FLOOR_HALF, newPos.z));

        mesh.position.copy(newPos);
        mesh.updateMatrixWorld(true);

        updateModelState(selectedModelIndex, {
          position: [newPos.x, newPos.y, newPos.z],
        });
      }

      if (rotating) {
        const xDelta = pointer.current.xDelta;
        const threshold = 0.001;
        if (Math.abs(xDelta) > threshold) {
          if (rotationTargets.current[selectedModelIndex] == null) {
            rotationTargets.current[selectedModelIndex] = mesh.rotation.y;
          }
          rotationTargets.current[selectedModelIndex]! += xDelta * 2;
        }
      }

      const targetY = rotationTargets.current[selectedModelIndex];
      if (targetY != null) {
        const oldY = mesh.rotation.y;
        const newY = THREE.MathUtils.lerp(oldY, targetY, 0.2);
        mesh.rotation.y = newY;
        mesh.updateMatrixWorld(true);

        const updatedOBB = getUpdatedOBB(entry);
        const collision = modelRefs.current.some((r, j) => {
          if (!r || j === selectedModelIndex) return false;
          return updatedOBB.intersectsOBB(getUpdatedOBB(r));
        });

        if (collision) {
          mesh.rotation.y = oldY;
          rotationTargets.current[selectedModelIndex] = oldY;
        } else {
          updateModelState(selectedModelIndex, {
            rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
          });
        }
      }

      pointer.current.xDelta = 0;
      pointer.current.yDelta = 0;
    });

    useEffect(() => {
      const el = gl.domElement;
      const move = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        pointer.current.xDelta = x - pointer.current.x;
        pointer.current.yDelta = y - pointer.current.y;
        pointer.current.x = x;
        pointer.current.y = y;
      };
      const down = (e: MouseEvent) => {
        if (selectedModelIndex === null) return;
        if (e.button === 0) {
          setDragging(true);
          const sel = modelRefs.current[selectedModelIndex];
          if (!sel) return;
          const rect = el.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const py = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          pointer.current.x = px;
          pointer.current.y = py;
          raycaster.current.setFromCamera(new THREE.Vector2(px, py), camera);
          raycaster.current.ray.intersectPlane(plane.current, intersection.current);
          dragOffset.current.subVectors(sel.mesh.position, intersection.current);
          e.preventDefault();
        }
        if (e.button === 1) {
          setRotating(true);
          e.preventDefault();
        }
        if (e.button === 2) {
          setSelectedModelIndex(null);
          e.preventDefault();
        }
      };
      const up = () => {
        setDragging(false);
        setRotating(false);
      };

      el.addEventListener("pointermove", move);
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointerup", up);
      window.addEventListener("blur", up);
      return () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerdown", down);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("blur", up);
      };
    }, [selectedModelIndex]);

    return null;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.7)",
            color: "white",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10,
          }}
        >
          <h1>Loading models...</h1>
        </div>
      )}
      {isSaving && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            backgroundColor: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "6px 12px",
            borderRadius: "5px",
            fontSize: "14px",
            zIndex: 10,
          }}
        >
          Saving...
        </div>
      )}
      <Canvas
        shadows
        style={{ background: "#d0d0d0" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          setTimeout(() => setIsLoading(false), 1000);
        }}
      >
        <EnhancedLighting />
        <Cameras topDown={topDown} />
        <OrbitControls
          enabled={selectedModelIndex === null}
          enableRotate={!topDown}
          enablePan={true}
          enableZoom={true}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={0}
          minDistance={1}
          maxDistance={100}
        />
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, -0.01, 0]}
          receiveShadow
          onPointerDown={(e) => {
            if (dragging || rotating) return;
            e.stopPropagation();
          }}
        >
          <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
          <meshStandardMaterial color="#444" />
        </mesh>
        {models.map((m, i) => (
          <Model
            key={m.id}
            path={m.path}
            position={m.position}
            rotation={m.rotation}
            selected={selectedModelIndex === i}
            onClick={() => setSelectedModelIndex(i)}
            ref={(el) => {
              if (el) {
                const obb = new OBB();
                const localCenter = new THREE.Vector3(0, 1, 0);
                obb.center.copy(localCenter);
                obb.halfSize.set(0.6, 0.9, 0.6);
                modelRefs.current[i] = {
                  mesh: el,
                  obb,
                  originalHalfSize: obb.halfSize.clone(),
                  localCenter,
                };
              }
            }}
          />
        ))}
        <DragControls />
      </Canvas>
    </div>
  );
});

export default SceneWrapper;
