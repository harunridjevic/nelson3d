import React, {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useGLTF } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";

// Patch raycast for faster intersection
THREE.Mesh.prototype.raycast = acceleratedRaycast;

type Vec3 = [number, number, number];

interface ModelProps {
  path: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  onClick?: () => void;
  selected?: boolean;
  onLoad?: () => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
  onContextMenu?: (e: ThreeEvent<MouseEvent>) => void;
}

const Model = forwardRef<THREE.Object3D, ModelProps>(
  (
    {
      path,
      position = [0, 0, 0],
      rotation = [0, 0, 0],
      scale = [1, 1, 1],
      onClick,
      selected = false,
      onLoad,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onContextMenu,
    },
    ref
  ) => {
    const { scene } = useGLTF(path);
    const clonedSceneRef = useRef<THREE.Object3D | null>(null);

    // Clone scene once
    if (!clonedSceneRef.current) {
      const cloned = scene.clone(true);

      cloned.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;

          // Clone material
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map((mat) => mat.clone())
            : mesh.material.clone();

          // Build BVH for faster raycasting
          mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });

      clonedSceneRef.current = cloned;
    }

    // Notify parent after model is loaded
    useEffect(() => {
      onLoad?.();
    }, [onLoad]);

    // Update material color based on selection
    useEffect(() => {
      if (!clonedSceneRef.current) return;

      clonedSceneRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];

          materials.forEach((mat) => {
            if ("color" in mat && mat instanceof THREE.MeshStandardMaterial) {
              mat.color.set(selected ? "#bb1a31" : "white"); // Use your deep red for selection
            }
          });
        }
      });
    }, [selected]);

    // Expose object via ref
    useImperativeHandle(ref, () => clonedSceneRef.current as THREE.Object3D, []);

    if (!clonedSceneRef.current) return null;

    return (
      <primitive
        object={clonedSceneRef.current}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick?.();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        castShadow
        receiveShadow
      />
    );
  }
);

Model.displayName = "Model";

export default Model;
