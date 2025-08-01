import React, { useEffect, useState } from "react";

type MouseIndicatorProps = {
  mode: "view" | "select";
  is2D: boolean;
};

export default function MouseIndicator({ mode, is2D }: MouseIndicatorProps) {
  const [buttonsPressed, setButtonsPressed] = useState({
    left: false,
    middle: false,
    right: false,
  });

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      setButtonsPressed({
        left: (e.buttons & 1) === 1,
        middle: (e.buttons & 4) === 4,
        right: (e.buttons & 2) === 2,
      });
    };

    const onPointerUp = () =>
      setButtonsPressed({ left: false, middle: false, right: false });

    // Removed wheel listener to prevent middle button light-up on scroll

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("blur", onPointerUp);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onPointerUp);
    };
  }, []);

  const defaultColor = "#ccc";
  const leftRightColor = "#18325f"; // dark navy
  const middleColor = "#bb1a31"; // deep red

  // Define labels separately for all four combinations:
  const legendItems = (() => {
    if (is2D) {
        if (mode === "view") {
            return [
              { key: "left", label: "Left Click: Select Object" },
              { key: "middle", label: "Middle Click: Zoom Camera" },
              { key: "right", label: "Right Click: Pan Camera" },
            ];
          } else {
            return [
              { key: "left", label: "Left Click: Drag Model" },
              { key: "middle", label: "Middle Click: Rotate Model" },
              { key: "right", label: "Right Click: Cancel Selection" },
            ];
          }
    } else {
      // 3D mode
      if (mode === "view") {
        return [
          { key: "left", label: "Left Click: Rotate Camera + Select Object" },
          { key: "middle", label: "Middle Click: Zoom Camera" },
          { key: "right", label: "Right Click: Pan Camera" },
        ];
      } else {
        return [
          { key: "left", label: "Left Click: Drag Model" },
          { key: "middle", label: "Middle Click: Rotate Model" },
          { key: "right", label: "Right Click: Cancel Selection" },
        ];
      }
    }
  })();

  const getColor = (key: "left" | "middle" | "right") => {
    if (!buttonsPressed[key]) return defaultColor;
    return key === "middle" ? middleColor : leftRightColor;
  };

  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: 12,
        borderRadius: 10,
        userSelect: "none",
        maxWidth: 180,
        fontFamily: "Arial, sans-serif",
        fontSize: 12,
        color: "#222",
        backgroundColor: "#fff",
      }}
    >
      <svg
        viewBox="0 0 41.031 41.031"
        width={100}
        height={120}
        style={{ display: "block", margin: "0 auto 12px" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g>
          <path
            d="M36.098,14.733V8c0-4.418-3.582-8-8-8h-3.666v14.733H36.098z"
            fill={getColor("right")}
            stroke="#444"
            strokeWidth={0.7}
          />
          <path
            d="M16.432,0h-3.667c-4.418,0-8,3.582-8,8v6.733h11.667V0z"
            fill={getColor("left")}
            stroke="#444"
            strokeWidth={0.7}
          />
          <path
            d="M4.932,17.781l1,15.25c0,4.418,3.582,8,8,8h13.333c4.418,0,8-3.582,8-8l1-15.25H4.932z"
            fill="#eee"
            stroke="#444"
            strokeWidth={0.7}
          />
          <ellipse
            cx="20.203"
            cy="7.367"
            rx="2.062"
            ry="6.7"
            fill={getColor("middle")}
            stroke="#444"
            strokeWidth={0.7}
          />
        </g>
      </svg>

      <div>
        {legendItems.map(({ key, label }) => (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 6,
              fontSize: 12,
              color: "#222",
              userSelect: "none",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                backgroundColor: getColor(key as keyof typeof buttonsPressed),
                marginRight: 8,
                border: "1px solid #888",
                flexShrink: 0,
              }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
