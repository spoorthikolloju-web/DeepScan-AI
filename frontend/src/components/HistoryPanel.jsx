import React from "react";

export default function HistoryPanel({ items, onClear }) {
  if (!items?.length) return (
    <div style={{ color: "var(--muted)", fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem", textAlign: "center", padding: "2rem" }}>
      No analyses yet
    </div>
  );

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: "0.8rem",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem",
                        color: "var(--muted)", textTransform: "uppercase",
                        letterSpacing: "0.1em" }}>
          RECENT ANALYSES ({items.length})
        </span>
        <button onClick={onClear} style={{
          background: "transparent", border: "1px solid var(--border)",
          borderRadius: 6, color: "var(--muted)",
          fontFamily: "var(--font-mono)", fontSize: "0.62rem",
          padding: "0.2rem 0.6rem", cursor: "pointer",
        }}>CLEAR</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {items.map(item => {
          const isFake = item.verdict === "FAKE";
          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: "0.75rem",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "0.7rem 1rem",
            }}>
              <span style={{ fontSize: "1.2rem" }}>
                {item.type === "image" ? "🖼️" : "🎬"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "0.82rem", fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{item.filename}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem",
                               color: "var(--muted)" }}>
                  {new Date(item.created_at).toLocaleTimeString()}
                  {item.duration_ms && ` · ${(item.duration_ms/1000).toFixed(1)}s`}
                </div>
              </div>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "0.7rem",
                fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: 6,
                background: isFake
                  ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                color: isFake ? "var(--fake)" : "var(--real)",
                border: `1px solid ${isFake ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
              }}>{item.verdict}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
