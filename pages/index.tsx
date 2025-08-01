// app.tsx
import React, { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import SceneWrapper, { SceneWrapperHandle } from "../components/SceneWrapper";
import { ModelState } from "../components/types";
import { db } from "../components/firebase";
import { collection, getDocs } from "firebase/firestore";
import Head from "next/head";
import MouseIndicator from "../components/MouseIndicator";

export default function App(): React.ReactElement {
  const [models, setModels] = useState<ModelState[]>([]);
  const [selectedModelIndex, setSelectedModelIndex] = useState<number | null>(null);
  const [topDown, setTopDown] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contentVisible, setContentVisible] = useState(true);

  const [mouseMinimized, setMouseMinimized] = useState(false);
  const [mouseContentVisible, setMouseContentVisible] = useState(true);
const [controlsVisible, setControlsVisible] = useState(true);
const toggleControls = () => setControlsVisible(!controlsVisible);
  const [cameraMinimized, setCameraMinimized] = useState(false);
  const [cameraContentVisible, setCameraContentVisible] = useState(true);
  const sceneRef = useRef<SceneWrapperHandle>(null); // ✅ proper type here
  
  const handleZoomIn = () => sceneRef.current?.zoomCamera(true);
const handleZoomOut = () => sceneRef.current?.zoomCamera(false);
const handlePanLeft = () => sceneRef.current?.panCamera("left");
const handleRotateRight = () => sceneRef.current?.rotateCamera("right");
  
  const sceneWrapperRef = useRef<SceneWrapperHandle>(null);
  useEffect(() => {
    async function loadModels() {
      try {
        const col = collection(db, "models");
        const snapshot = await getDocs(col);
        const loadedModels: ModelState[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          loadedModels.push({
            id: doc.id,
            path: data.path,
            position: data.position,
            rotation: data.rotation,
          });
        });
        if (loadedModels.length > 0) {
          setModels(loadedModels);
        }
      } catch (err) {
        console.error("Error loading models from Firestore:", err);
      }
    }
    loadModels();
  }, []);

  // Safe update model property (position or rotation)
  const safeUpdateModelProperty = (
    index: number,
    prop: "position" | "rotation",
    axis: 0 | 1 | 2,
    value: number
  ) => {
    if (sceneRef.current && index >= 0 && index < models.length) {
      const currentModel = models[index];
      const updated = [...currentModel[prop]] as [number, number, number];
      updated[axis] = value;

      const updates = prop === "position" ? { position: updated } : { rotation: updated };

      const success = sceneRef.current.safeUpdateModelTransform!(index, updates);
      if (!success) {
        alert("Update blocked due to collision!");
      }
    }
  };

  const controls: { label: string; prop: "position" | "rotation"; axis: 0 | 1 | 2 }[] = [
    { label: "Position X", prop: "position", axis: 0 },
    { label: "Position Z", prop: "position", axis: 2 },
    { label: "Rotation Y (radians)", prop: "rotation", axis: 1 },
  ];

  const toggleSidebar = () => {
    if (!sidebarCollapsed) {
      setContentVisible(false);
      setTimeout(() => setSidebarCollapsed(true), 200);
    } else {
      setSidebarCollapsed(false);
      setTimeout(() => setContentVisible(true), 300);
    }
  };

  const toggleMouseIndicator = () => {
    if (!mouseMinimized) {
      setMouseContentVisible(false);
      setTimeout(() => setMouseMinimized(true), 200);
    } else {
      setMouseMinimized(false);
      setTimeout(() => setMouseContentVisible(true), 300);
    }
  };

  const toggleCameraControls = () => {
    if (!cameraMinimized) {
      setCameraContentVisible(false);
      setTimeout(() => setCameraMinimized(true), 200);
    } else {
      setCameraMinimized(false);
      setTimeout(() => setCameraContentVisible(true), 300);
    }
  };

  // Hover styles for buttons
  function onButtonHoverEnter(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.backgroundColor = "#8f1435";
  }
  function onButtonHoverLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.backgroundColor = "#bb1a31";
  }

  // Input focus styles
  function onInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = "#bb1a31";
  }
  function onInputBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = "#ccc";
  }

  // Constants for camera movement
  const MOVE_STEP = 0.5;
  const ROTATE_STEP = Math.PI / 18; // 10 degrees in radians

  // Camera move handler
const onMove = (dx: number, dy: number, dz: number) => {
  const cam = sceneRef.current?.getCamera();
  if (!cam) return;

  // Promijeni poziciju kamere
  const newPos: [number, number, number] = [
    cam.position.x + dx,
    cam.position.y + dy,
    cam.position.z + dz,
  ];

  sceneRef.current?.setCamera({ position: newPos });
};

// Camera rotate handler (Euler angles in radians)
const onRotate = (pitch: number, yaw: number, roll: number) => {
  const cam = sceneRef.current?.getCamera();
  if (!cam) return;

  // Napravi novi Euler sa povećanjem trenutne rotacije
  const newRotation: [number, number, number] = [
    cam.rotation.x + pitch,
    cam.rotation.y + yaw,
    cam.rotation.z + roll,
  ];

  sceneRef.current?.setCamera({ rotation: newRotation });
};


  return (
    <>
      <Head>
        <title>Nelson3D by Harun Ridjevic</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Scene fullscreen container */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          zIndex: 0,
          backgroundColor: "#fff",
        }}
      >
        <SceneWrapper
          ref={sceneRef}
          topDown={topDown}
          models={models}
          setModels={setModels}
          selectedModelIndex={selectedModelIndex}
          setSelectedModelIndex={setSelectedModelIndex}
        />
      </div>

      {/* Sidebar */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          width: sidebarCollapsed ? 0 : 215,
          overflow: "hidden",
          backgroundColor: "#fff",
          borderRight: sidebarCollapsed ? "none" : "1px solid #ccc",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.3s ease, border-right 0.3s ease",
          zIndex: 20,
          userSelect: "none",
        }}
      >
        <div
          style={{
            opacity: contentVisible ? 1 : 0,
            pointerEvents: contentVisible ? "auto" : "none",
            transition: "opacity 0.2s ease",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          {/* Logo */}
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid #ddd",
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            <img
              src="/app_logo.png"
              alt="App Logo"
              style={{
                maxWidth: "100%",
                height: "auto",
                userSelect: "none",
                pointerEvents: "none",
                display: "block",
              }}
            />
          </div>

          {/* Controls container */}
          <div
            style={{
              flexGrow: 1,
              overflowY: "auto",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              color: "#18325f",
              fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
              fontWeight: 600,
            }}
          >
            {/* Toggle view button */}
            <button
              onClick={() => setTopDown((prev) => !prev)}
              style={buttonStyle}
              onMouseEnter={onButtonHoverEnter}
              onMouseLeave={onButtonHoverLeave}
              type="button"
            >
              Toggle View ({topDown ? "2D" : "3D"})
            </button>

            {/* Mode display */}
            <div>
              <strong>Mode: </strong>
              {selectedModelIndex === null ? (
                <span style={{ color: "#bb1a31", fontWeight: "700" }}>View Mode</span>
              ) : (
                <span style={{ color: "#18325f", fontWeight: "700" }}>
                  Select Mode (Item #{selectedModelIndex + 1})
                </span>
              )}
            </div>

            {/* Controls inputs if selected */}
            {selectedModelIndex !== null && models[selectedModelIndex]
              ? controls.map(({ label, prop, axis }) => (
                  <label
                    key={label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      fontWeight: "600",
                      color: "#18325f",
                      fontSize: 14,
                      marginBottom: 12,
                    }}
                  >
                    {label}:
                    <input
                      type="number"
                      step={0.01}
                      value={models[selectedModelIndex]?.[prop]?.[axis] ?? 0}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value);
                        if (!isNaN(newValue)) {
                          safeUpdateModelProperty(selectedModelIndex, prop, axis, newValue);
                        }
                      }}
                      style={{
                        marginTop: 6,
                        padding: "8px 12px",
                        fontSize: 14,
                        borderRadius: 6,
                        border: "1.5px solid #ccc",
                        outlineColor: "#bb1a31",
                        transition: "border-color 0.25s ease",
                        color: "#18325f",
                        fontWeight: "600",
                        width: "100%",
                      }}
                      onFocus={onInputFocus}
                      onBlur={onInputBlur}
                    />
                  </label>
                ))
              : null}
          </div>
        </div>
      </aside>
      
      {/* Sidebar toggle button */}
      <button
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          position: "fixed",
          top: "50%",
          left: sidebarCollapsed ? 0 : 215,
          transform: "translateY(-50%)",
          height: 50,
          width: 40,
          borderRadius: "0 6px 6px 0",
          border: "none",
          backgroundColor: "#bb1a31",
          color: "white",
          cursor: "pointer",
          fontSize: 22,
          fontWeight: "700",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 30,
          transition: "left 0.3s ease, background-color 0.3s ease",
        }}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
        type="button"
      >
        {sidebarCollapsed ? "▶" : "◀"}
      </button>

      {/* Mouse Indicator container (top-right) */}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 9999,
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          padding: mouseMinimized ? 0 : 12,
          borderRadius: mouseMinimized ? "50%" : 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          userSelect: "none",
          maxWidth: mouseMinimized ? 48 : 320,
          width: mouseMinimized ? 48 : "auto",
          height: mouseMinimized ? 48 : "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: mouseMinimized ? "center" : "flex-start",
          transition:
            "width 0.3s ease, height 0.3s ease, padding 0.3s ease, border-radius 0.3s ease, max-width 0.3s ease",
          overflow: "hidden",
          cursor: "default",
        }}
      >
        {/* Mouse label top-left */}
        {!mouseMinimized && (
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 12,
              color: "black",
              fontWeight: "700",
              fontSize: 16,
              userSelect: "none",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            Mouse
          </div>
        )}

        {/* Minimize / Expand Button */}
        <button
          onClick={toggleMouseIndicator}
          aria-label={mouseMinimized ? "Expand Mouse Indicator" : "Minimize Mouse Indicator"}
          title={mouseMinimized ? "Expand Mouse Indicator" : "Minimize Mouse Indicator"}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            height: 24,
            width: 24,
            borderRadius: 12,
            border: "none",
            backgroundColor: "#bb1a31",
            color: "white",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: "700",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 0.3s ease",
            zIndex: 10000,
          }}
          onMouseEnter={onButtonHoverEnter}
          onMouseLeave={onButtonHoverLeave}
          type="button"
        >
          {mouseMinimized ? "+" : "−"}
        </button>

        {/* Mouse Indicator Content */}
        <div
          style={{
            opacity: mouseContentVisible ? 1 : 0,
            pointerEvents: mouseContentVisible ? "auto" : "none",
            transition: "opacity 0.2s ease",
            width: "100%",
            paddingTop: 28,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <MouseIndicator mode={selectedModelIndex === null ? "view" : "select"} is2D={topDown} />
        </div>
      </div>

      {/* Camera Controls (Bottom-Right) */}
<div
  style={{
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 12,
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    userSelect: "none",
    maxWidth: 300,
    width: "100%",
  }}
>
  {/* Label + Zoom & Minimize Controls in one row */}
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "minmax(130px, 1fr) repeat(3, 36px)",
      gap: 10,
      alignItems: "center",
      marginBottom: controlsVisible ? 8 : 3,
    }}
  >
    <div
      style={{
        fontWeight: "700",
        fontSize: 16,
        color: "black",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        userSelect: "none",
        paddingRight: 8,
      }}
    >
      Camera Controls
    </div>

    <button
      style={buttonStyle}
      onClick={handleZoomIn}
      onMouseEnter={onButtonHoverEnter}
      onMouseLeave={onButtonHoverLeave}
    >
      +
    </button>
    <button
      style={buttonStyle}
      onClick={handleZoomOut}
      onMouseEnter={onButtonHoverEnter}
      onMouseLeave={onButtonHoverLeave}
    >
      −
    </button>
    <button
      style={{
        ...buttonStyleMin,
        borderRadius: "50%",
        fontWeight: "700",
        fontSize: 20,
        lineHeight: 1,
        padding: 0,
        width: 36,
        height: 36,
        minWidth: "unset",
      }}
      onClick={toggleControls}
    >
      {controlsVisible ? "−" : "+"}
    </button>
  </div>

  {/* Animated container for Pan & Rotate Controls */}
  <div
    style={{
      maxHeight: controlsVisible ? 300 : 0,
      opacity: controlsVisible ? 1 : 0,
      overflow: "hidden",
      transition: "max-height 0.3s ease, opacity 0.3s ease",
    }}
  >
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
      {/* Top row: ↖ ↑ ↗ */}
      <button
        style={buttonStyle}
        onClick={() => sceneRef.current?.rotateCamera("left")}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
      >
        ↲
      </button>
      <button
        style={buttonStyle}
        onClick={() => sceneRef.current?.panCamera("up")}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
      >
        ↑
      </button>
      <button
        style={buttonStyle}
        onClick={() => sceneRef.current?.rotateCamera("right")}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
      >
        ↳
      </button>

      {/* Middle row: ← ○ → */}
      <button
        style={buttonStyle}
        onClick={() => sceneRef.current?.panCamera("left")}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
      >
        ←
      </button>
      <div /> {/* Spacer */}
      <button
        style={buttonStyle}
        onClick={() => sceneRef.current?.panCamera("right")}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
      >
        →
      </button>

      {/* Bottom row: ↙ ↓ ↘ */}
      <button
        style={buttonStyle}
        onClick={() => sceneRef.current?.rotateCamera("down")}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
      >
        ⬐
      </button>
      <button
        style={buttonStyle}
        onClick={() => sceneRef.current?.panCamera("down")}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
      >
        ↓
      </button>
      <button
        style={buttonStyle}
        onClick={() => sceneRef.current?.rotateCamera("up")}
        onMouseEnter={onButtonHoverEnter}
        onMouseLeave={onButtonHoverLeave}
      >
        ⬏
      </button>
    </div>
  </div>
</div>


    </>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  cursor: "pointer",
  backgroundColor: "#bb1a31",
  border: "none",
  color: "white",
  fontSize: "1.2rem",
  fontWeight: "700",
  borderRadius: 6,
  boxShadow: "0 2px 6px rgb(187 26 49 / 0.5)",
  userSelect: "none",
  minWidth: 40,
  textAlign: "center",
};

const buttonStyleMin: React.CSSProperties = {
  padding: "8px 14px",
  cursor: "pointer",
  backgroundColor: "#18325f",
  border: "none",
  color: "white",
  fontSize: "1.2rem",
  fontWeight: "700",
  borderRadius: 6,
  boxShadow: "0 2px 6px rgb(187 26 49 / 0.5)",
  userSelect: "none",
  minWidth: 40,
  textAlign: "center",
};
