import React from "react";

const dot = (ok) => ({
  display: "inline-block",
  width: 8, height: 8,
  borderRadius: "50%",
  background: ok ? "var(--real)" : "var(--fake)",
  boxShadow: ok ? "0 0 8px var(--real)" : "0 0 6px var(--fake)",
  marginRight: 6,
  flexShrink: 0,
});

export default function StatusBar({ health, onCheck }) {
  const expressOk = health?.express?.status === "ok";
  const fastapiOk = health?.fastapi?.status === "ok";
  const demo      = health?.fastapi?.demo_mode;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 20,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10, padding: "0.6rem 1.2rem",
      fontFamily: "var(--font-mono)", fontSize: "0.7rem",
      color: "var(--muted)", flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={dot(expressOk)} />
        Express {expressOk ? "online" : "offline"} :3001
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={dot(fastapiOk)} />
        FastAPI {fastapiOk ? "online" : "offline"} :8000
      </div>
      {fastapiOk && (
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={dot(health?.fastapi?.models_loaded)} />
          Models {health?.fastapi?.models_loaded
            ? `loaded (${health.fastapi.num_models})`
            : "not loaded"}
          {health?.fastapi?.device && ` · ${health.fastapi.device}`}
        </div>
      )}
      {demo && (
        <span style={{
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 6, padding: "0.15rem 0.6rem",
          color: "var(--warn)",
        }}>DEMO MODE</span>
      )}
      <button onClick={onCheck} style={{
        marginLeft: "auto", background: "transparent",
        border: "1px solid var(--border)", borderRadius: 6,
        color: "var(--muted)", fontFamily: "var(--font-mono)",
        fontSize: "0.68rem", padding: "0.25rem 0.7rem",
        cursor: "pointer",
      }}>REFRESH</button>
    </div>
  );
}
