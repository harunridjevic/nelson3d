import React, { useState, useEffect, useRef } from "react";
import SceneWrapper from "../components/SceneWrapper";
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

  const sceneRef = useRef<{ safeUpdateModelTransform?: (index: number, updates: object) => boolean } | null>(null);

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

  // Helper functions for mouse enter/leave to change styles:
  function onButtonHoverEnter(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.backgroundColor = "#8f1435";
  }
  function onButtonHoverLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.backgroundColor = "#bb1a31";
  }

  function onInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = "#bb1a31";
  }
  function onInputBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = "#ccc";
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Head,
      null,
      React.createElement("title", null, "Nelson3D by Harun Ridjevic"),
      React.createElement("link", { rel: "icon", href: "/favicon.ico" })
    ),

    // Scene Wrapper fullscreen container
    React.createElement("div", {
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        zIndex: 0,
        backgroundColor: "#fff",
      },
    }, React.createElement(SceneWrapper, {
      ref: sceneRef,
      topDown,
      models,
      setModels,
      selectedModelIndex,
      setSelectedModelIndex,
    })),

    // Sidebar
    React.createElement(
      "aside",
      {
        style: {
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
        },
      },
      React.createElement(
        "div",
        {
          style: {
            opacity: contentVisible ? 1 : 0,
            pointerEvents: contentVisible ? "auto" : "none",
            transition: "opacity 0.2s ease",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          },
        },
        // Logo
        React.createElement(
          "div",
          {
            style: {
              padding: "16px",
              borderBottom: "1px solid #ddd",
              textAlign: "center",
              flexShrink: 0,
            },
          },
          React.createElement("img", {
            src: "/app_logo.png",
            alt: "App Logo",
            style: {
              maxWidth: "100%",
              height: "auto",
              userSelect: "none",
              pointerEvents: "none",
              display: "block",
            },
          })
        ),

        // Controls container
        React.createElement(
          "div",
          {
            style: {
              flexGrow: 1,
              overflowY: "auto",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              color: "#18325f",
              fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
              fontWeight: 600,
            },
          },

          // Toggle view button
          React.createElement(
            "button",
            {
              onClick: () => setTopDown((prev) => !prev),
              style: {
                padding: "10px 14px",
                cursor: "pointer",
                backgroundColor: "#bb1a31",
                border: "none",
                color: "white",
                fontSize: "1rem",
                fontWeight: "700",
                borderRadius: 6,
                boxShadow: "0 2px 6px rgb(187 26 49 / 0.5)",
                userSelect: "none",
                transition: "background-color 0.3s ease",
              },
              onMouseEnter: onButtonHoverEnter,
              onMouseLeave: onButtonHoverLeave,
            },
            `Toggle View (${topDown ? "2D" : "3D"})`
          ),

          // Mode display
          React.createElement(
            "div",
            null,
            React.createElement("strong", null, "Mode: "),
            selectedModelIndex === null
              ? React.createElement(
                "span",
                { style: { color: "#bb1a31", fontWeight: "700" } },
                "View Mode"
              )
              : React.createElement(
                "span",
                { style: { color: "#18325f", fontWeight: "700" } },
                `Select Mode (Item #${selectedModelIndex + 1})`
              )
          ),

          // Controls inputs if selected
          selectedModelIndex !== null && models[selectedModelIndex]
            ? controls.map(({ label, prop, axis }) =>
              React.createElement(
                "label",
                {
                  key: label,
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    fontWeight: "600",
                    color: "#18325f",
                    fontSize: 14,
                    marginBottom: 12,
                  },
                },
                label + ":",
                React.createElement("input", {
                  type: "number",
                  step: 0.01,
                  value: models[selectedModelIndex]?.[prop]?.[axis] ?? 0,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    const newValue = parseFloat(e.target.value);
                    if (!isNaN(newValue)) {
                      safeUpdateModelProperty(selectedModelIndex, prop, axis, newValue);
                    }
                  },
                  style: {
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
                  },
                  onFocus: onInputFocus,
                  onBlur: onInputBlur,
                })
              )
            )
            : null
        )
      )
    ),

    // Sidebar toggle button
    React.createElement(
      "button",
      {
        onClick: toggleSidebar,
        "aria-label": sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
        title: sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
        style: {
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
        },
        onMouseEnter: onButtonHoverEnter,
        onMouseLeave: onButtonHoverLeave,
      },
      sidebarCollapsed ? "▶" : "◀"
    ),

    // Mouse Indicator container
    React.createElement(
      "div",
      {
        style: {
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
        },
      },

      // Mouse label top-left
      !mouseMinimized
        ? React.createElement(
          "div",
          {
            style: {
              position: "absolute",
              top: 10,
              left: 12,
              color: "black",
              fontWeight: "700",
              fontSize: 16,
              userSelect: "none",
              pointerEvents: "none",
              zIndex: 10,
            },
          },
          "Mouse"
        )
        : null,

      // Minimize / Expand Button
      React.createElement(
        "button",
        {
          onClick: toggleMouseIndicator,
          "aria-label": mouseMinimized ? "Expand Mouse Indicator" : "Minimize Mouse Indicator",
          title: mouseMinimized ? "Expand Mouse Indicator" : "Minimize Mouse Indicator",
          style: {
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
          },
          onMouseEnter: onButtonHoverEnter,
          onMouseLeave: onButtonHoverLeave,
          type: "button",
        },
        mouseMinimized ? "+" : "−"
      ),

      // Mouse Indicator Content
      React.createElement(
        "div",
        {
          style: {
            opacity: mouseContentVisible ? 1 : 0,
            pointerEvents: mouseContentVisible ? "auto" : "none",
            transition: "opacity 0.2s ease",
            width: "100%",
            paddingTop: 28,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          },
        },
        React.createElement(MouseIndicator, {
          mode: selectedModelIndex === null ? "view" : "select",
          is2D: topDown,
        })
      )
    )
  );
}
