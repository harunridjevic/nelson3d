// CameraControls.tsx
import React from "react";

type Props = {
  onRotate: (azimuth: number, polar: number) => void;
  onPan: (dx: number, dy: number) => void;
  onZoom: (inward: boolean) => void;
};

const CameraControls = ({ onRotate, onPan, onZoom }: Props) => {
  return (
    <div style={{
      position: "absolute",
      bottom: 20,
      right: 20,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      background: "rgba(0,0,0,0.5)",
      padding: 10,
      borderRadius: 8
    }}>
      <div>
        <strong style={{ color: "white" }}>Rotate</strong>
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          <button onClick={() => onRotate(-0.1, 0)}>⟲ Left</button>
          <button onClick={() => onRotate(0.1, 0)}>⟳ Right</button>
          <button onClick={() => onRotate(0, -0.1)}>⬆ Up</button>
          <button onClick={() => onRotate(0, 0.1)}>⬇ Down</button>
        </div>
      </div>
      <div>
        <strong style={{ color: "white" }}>Pan</strong>
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          <button onClick={() => onPan(-1, 0)}>← Left</button>
          <button onClick={() => onPan(1, 0)}>→ Right</button>
          <button onClick={() => onPan(0, 1)}>↑ Up</button>
          <button onClick={() => onPan(0, -1)}>↓ Down</button>
        </div>
      </div>
      <div>
        <strong style={{ color: "white" }}>Zoom</strong>
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          <button onClick={() => onZoom(true)}>➕ In</button>
          <button onClick={() => onZoom(false)}>➖ Out</button>
        </div>
      </div>
    </div>
  );
};

export default CameraControls;
