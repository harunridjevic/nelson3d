// components/types.ts
export type Vec3 = [number, number, number];

export interface ModelState {
  id: string;
  path: string;
  position: Vec3;
  rotation: Vec3;
  scale?: [number, number, number]; // optional
}
