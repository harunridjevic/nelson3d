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
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'; // add this import


export type SceneWrapperHandle = {
  resetCamera: () => void;
  zoomToModel: (index: number) => boolean;
  orbitAroundModel: (index: number, angle: number) => boolean;
  getCamera: () => {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    zoom: number;
  };
  setCamera: (params: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    zoom?: number;
  }) => void;
  safeUpdateModelTransform: (
    index: number,
    updates: Partial<{
      position: [number, number, number];
      rotation: [number, number, number];
    }>
  ) => boolean;

  // 👇 New functions
  panCamera: (dir: "left" | "right" | "up" | "down") => void;
  rotateCamera: (dir: "left" | "right" | "up" | "down") => void;
  zoomCamera: (inOrOut: boolean) => void;
};

const FLOOR_SIZE = 20;
const FLOOR_HALF = FLOOR_SIZE / 2;

interface SceneWrapperProps {
  topDown: boolean;
  models: ModelState[];
  setModels: React.Dispatch<React.SetStateAction<ModelState[]>>;
  selectedModelIndex: number | null;
  setSelectedModelIndex: React.Dispatch<React.SetStateAction<number | null>>;
}


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
    <ContactShadows position={[0, 0, 0]} opacity={0.75} scale={20} blur={1.5} far={10} />
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

type CameraControlParams = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  zoom?: number;
};

const InnerCameraControls = forwardRef<
  {
    getCamera: () => {
      position: THREE.Vector3;
      rotation: THREE.Euler;
      zoom: number;
    };
    setCamera: (params: CameraControlParams) => void;
    resetCamera: () => void;
  },
  Record<string, never> // ✅ instead of {}
>((_, ref) => {
  const { camera } = useThree();

  useImperativeHandle(ref, () => ({
    getCamera: () => ({
      position: camera.position.clone(),
      rotation: camera.rotation.clone(),
      zoom: camera.zoom,
    }),
    setCamera: (params: CameraControlParams) => {
      if (params.position) camera.position.set(...params.position);
      if (params.rotation) camera.rotation.set(...params.rotation);
      if (params.zoom !== undefined) camera.zoom = params.zoom;
      camera.updateProjectionMatrix();
    },
    resetCamera: () => {
      camera.position.set(5, 5, 5);
      camera.rotation.set(0, 0, 0);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
    },
  }));

  return null;
});
const zoomCamera = (orbit: OrbitControlsImpl, zoomIn: boolean, zoomStep = 0.5) => {
  const camera = orbit.object;
  const target = orbit.target;

  // Vector from target to camera
  const direction = new THREE.Vector3().subVectors(camera.position, target);

  // Change length (distance) of that vector
  const distance = direction.length();
  const newDistance = zoomIn ? distance - zoomStep : distance + zoomStep;

  // Clamp to min/max distances
  const minDistance = orbit.minDistance || 1;
  const maxDistance = orbit.maxDistance || 100;

  const clampedDistance = Math.min(maxDistance, Math.max(minDistance, newDistance));

  // Set new camera position
  direction.setLength(clampedDistance);
  camera.position.copy(target).add(direction);

  orbit.update();
};

const rotateCamera = (
  orbit: OrbitControlsImpl,
  direction: "left" | "right" | "up" | "down",
  angleStep = 0.5 // radians per keypress
) => {
  let azimuthal = orbit.getAzimuthalAngle();
  let polar = orbit.getPolarAngle();

  switch (direction) {
    case "left":
      azimuthal -= angleStep;
      break;
    case "right":
      azimuthal += angleStep;
      break;
    case "up":
      polar -= angleStep;
      break;
    case "down":
      polar += angleStep;
      break;
  }

  // Clamp polar angle so camera doesn't flip over
  const minPolar = orbit.minPolarAngle || 0;
  const maxPolar = orbit.maxPolarAngle || Math.PI;

  polar = Math.min(maxPolar, Math.max(minPolar, polar));

  orbit.setAzimuthalAngle(azimuthal);
  orbit.setPolarAngle(polar);
  orbit.update();
};

const panCamera = (
  orbit: OrbitControlsImpl,
  direction: "left" | "right" | "up" | "down",
  distance = 0.5,
  duration = 200
) => {
  const camera = orbit.object;
  const offset = new THREE.Vector3();

  // Get camera basis vectors
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();

  camera.getWorldDirection(forward); // normalized
  forward.y = 0; // keep movement horizontal
  forward.normalize();

  right.crossVectors(forward, camera.up).normalize();
  up.copy(camera.up).normalize();

  // Determine direction vector
  switch (direction) {
    case "left":
      offset.copy(right).multiplyScalar(-distance);
      break;
    case "right":
      offset.copy(right).multiplyScalar(distance);
      break;
    case "up":
      offset.copy(up).multiplyScalar(distance);
      break;
    case "down":
      offset.copy(up).multiplyScalar(-distance);
      break;
  }

  const startTime = performance.now();
  const startPosition = camera.position.clone();
  const startTarget = orbit.target.clone();
  const endPosition = startPosition.clone().add(offset);
  const endTarget = startTarget.clone().add(offset);

  const animate = (now: number) => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    camera.position.lerpVectors(startPosition, endPosition, t);
    orbit.target.lerpVectors(startTarget, endTarget, t);
    orbit.update();

    if (t < 1) requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);
};

InnerCameraControls.displayName = "InnerCameraControls";
const SceneWrapper = forwardRef<SceneWrapperHandle, SceneWrapperProps>(
  (
    { topDown, models, setModels, selectedModelIndex, setSelectedModelIndex },
    ref
  ) => {
    const modelRefs = useRef<(ModelRefEntry | null)[]>([]);
    const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
    const draggingRef = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [savingCount, setSavingCount] = useState(0);
    const savingCountRef = useRef(0);
    const unsavedModelsRef = useRef<Set<number>>(new Set());
    const orbitRef = useRef<OrbitControlsImpl>(null);
  const pointer = useRef({ x: 0, y: 0, xDelta: 0, yDelta: 0 });
  const raycaster = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersection = useRef(new THREE.Vector3());
  const dragOffset = useRef(new THREE.Vector3());
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);
  const rotationTargets = useRef<(number | null)[]>([]);
    // Ref za InnerCameraControls

    useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!orbitRef.current) return;
    const orbit = orbitRef.current;

    switch (e.key.toLowerCase()) {
      // Pan with arrow keys
      case "arrowleft":
        panCamera(orbit, "left");
        break;
      case "arrowright":
        panCamera(orbit, "right");
        break;
      case "arrowup":
        panCamera(orbit, "up");
        break;
      case "arrowdown":
        panCamera(orbit, "down");
        break;

      // Rotate with WASD
      case "a":
        rotateCamera(orbit, "left");
        break;
      case "d":
        rotateCamera(orbit, "right");
        break;
      case "w":
        rotateCamera(orbit, "up");
        break;
      case "s":
        rotateCamera(orbit, "down");
        break;

        case "u":
  zoomCamera(orbit, true);  // zoom in
  break;
case "i":
  zoomCamera(orbit, false); // zoom out
  break;
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, []);


    const cameraControlsRef = useRef<{
      getCamera: () => {
        position: THREE.Vector3;
        rotation: THREE.Euler;
        zoom: number;
      };
      setCamera: (params: CameraControlParams) => void;
      resetCamera: () => void;
    }>(null);

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

    function getUpdatedOBB(entry: ModelRefEntry): OBB {
      const obb = entry.obb.clone();
      const worldCenter = getWorldCenter(entry.mesh, entry.localCenter);
      obb.center.copy(worldCenter);
      obb.halfSize.copy(entry.originalHalfSize);
      obb.rotation.copy(getRotationMatrixFromObject(entry.mesh));
      return obb;
    }

    useImperativeHandle(ref, () => ({
      safeUpdateModelTransform: (
        index: number,
        updates: Partial<{
          position: [number, number, number];
          rotation: [number, number, number];
        }>
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
      panCamera: (dir) => {
    if (orbitRef.current) panCamera(orbitRef.current, dir);
  },
  rotateCamera: (dir) => {
    if (orbitRef.current) rotateCamera(orbitRef.current, dir);
  },
  zoomCamera: (inOrOut) => {
    if (orbitRef.current) zoomCamera(orbitRef.current, inOrOut);
  },
  
      getCamera: () => {
  if (!cameraControlsRef.current) {
    throw new Error("cameraControlsRef is not available");
  }
  return cameraControlsRef.current.getCamera();
},


      setCamera: (params: CameraControlParams) =>
        cameraControlsRef.current?.setCamera(params),

      resetCamera: () => cameraControlsRef.current?.resetCamera(),

      zoomToModel: (index: number) => {
        const entry = modelRefs.current[index];
        if (!entry) return false;

        const modelCenter = getWorldCenter(entry.mesh, entry.localCenter);

        if (topDown) {
          cameraControlsRef.current?.setCamera({
            position: [modelCenter.x, 10, modelCenter.z],
            rotation: [-Math.PI / 2, 0, Math.PI / 2],
            zoom: 4,
          });
        } else {
          const distance = 5;
          const x = modelCenter.x + distance;
          const y = modelCenter.y + distance;
          const z = modelCenter.z + distance;
          cameraControlsRef.current?.setCamera({
            position: [x, y, z],
            rotation: [-0.5, 0.5, 0], // primjer, možeš prilagoditi
          });
        }

        return true;
      },

      

      orbitAroundModel: (index: number, angle: number) => {
        const entry = modelRefs.current[index];
        if (!entry) return false;

        const modelCenter = getWorldCenter(entry.mesh, entry.localCenter);
        const radius = 5;
        const x = modelCenter.x + radius * Math.cos(angle);
        const y = modelCenter.y + radius * 0.5;
        const z = modelCenter.z + radius * Math.sin(angle);
        cameraControlsRef.current?.setCamera({
          position: [x, y, z],
        });
        // lookAt se može dodat ako treba

        return true;
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

    // --- Ovdje ide tvoj CustomControls, DragControls, Mouse event handlers itd.
    // Za potpunu funkcionalnost, moram pretpostaviti da su već implementirani kao što si ranije imao.

    // Za primjer, samo placeholder:
    function CustomControls(props: {
  selectedModelIndex: number | null;
  modelRefs: React.MutableRefObject<(ModelRefEntry | null)[]>;
}) {
  const { gl } = useThree();
  const orbit = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const domElement = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      if (props.selectedModelIndex === null) return; // only when a model is selected
      e.preventDefault();

      const zoomIn = e.deltaY < 0;
      if (orbit.current) zoomCamera(orbit.current, zoomIn);
    };

    domElement.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      domElement.removeEventListener("wheel", onWheel);
    };
  }, [props.selectedModelIndex]);

  // Get OrbitControls instance from global scene (SceneWrapper)
  useEffect(() => {
    const controls = orbitRef.current;
    if (controls) orbit.current = controls;
  }, []);

  return null;
}


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
        {savingCount > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 230,
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
          onPointerMissed={() => {
            if (selectedModelIndex !== null) {
              setSelectedModelIndex(null);
            }
          }}
        >
          <EnhancedLighting />
          <Cameras topDown={topDown} />

          {/* OrbitControls only active when nothing is selected */}
          <OrbitControls
  ref={orbitRef}
  enabled={selectedModelIndex === null}
  enableRotate={!topDown}
  enablePan={true}
  enableZoom={true}
  maxPolarAngle={Math.PI / 2}
  minPolarAngle={0}
  minDistance={1}
  maxDistance={100}
/>


          {/* Tvoj CustomControls */}
          <CustomControls
            selectedModelIndex={selectedModelIndex}
            modelRefs={modelRefs}
          />

          {/* Floor */}
          <mesh
            rotation-x={-Math.PI / 2}
            position={[0, -0.01, 0]}
            receiveShadow
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              pointerDownPos.current = { x: e.clientX, y: e.clientY };
              draggingRef.current = false;
              e.stopPropagation();
            }}
            onPointerMove={(e) => {
              if (!pointerDownPos.current) return;
              const dx = e.clientX - pointerDownPos.current.x;
              const dy = e.clientY - pointerDownPos.current.y;
              if (!draggingRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                draggingRef.current = true;
              }
            }}
            onPointerUp={(e) => {
              if (e.button !== 0) return;
              if (!draggingRef.current && selectedModelIndex !== null) {
                setSelectedModelIndex(null);
              }
              pointerDownPos.current = null;
              draggingRef.current = false;
            }}
          >
            <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
            <meshStandardMaterial color="#444" />
          </mesh>

          {/* Models */}
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

          <InnerCameraControls/>
        </Canvas>
      </div>
    );
  }
);
SceneWrapper.displayName = "SceneWrapper";
export default SceneWrapper;
