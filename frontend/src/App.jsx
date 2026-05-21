import React, { useState, useEffect, useCallback } from "react";
import StatusBar     from "./components/StatusBar";
import UploadZone   from "./components/UploadZone";
import ResultCard   from "./components/ResultCard";
import HistoryPanel from "./components/HistoryPanel";
import { useApi }   from "./hooks/useApi";

const TAB_STYLE = (active) => ({
  flex: 1, padding: "0.6rem 1.2rem",
  background: active ? "var(--accent)" : "transparent",
  border: "none", borderRadius: 8, cursor: "pointer",
  color: active ? "#fff" : "var(--muted)",
  fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "0.9rem",
  transition: "all 0.2s",
  boxShadow: active ? "0 0 18px var(--glow)" : "none",
});

export default function App() {
  const { loading, error, result, health,
          predict, checkHealth, fetchHistory, clearHistory } = useApi();

  const [mode,       setMode]      = useState("image");   // "image" | "video"
  const [file,       setFile]      = useState(null);
  const [numFrames,  setNumFrames] = useState(20);
  const [history,    setHistory]   = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Initial health check
  useEffect(() => { checkHealth(); }, [checkHealth]);

  // Refresh history when result changes
  useEffect(() => {
    if (result) fetchHistory().then(d => setHistory(d.history || []));
  }, [result, fetchHistory]);

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setHistory([]);
  }, [clearHistory]);

  async function handleAnalyze() {
    if (!file) return;
    await predict(file, mode, numFrames);
  }

  function handleModeSwitch(m) {
    setMode(m);
    setFile(null);
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>

      {/* Grid background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(109,40,217,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(109,40,217,0.04) 1px, transparent 1px)`,
        backgroundSize: "44px 44px",
      }} />

      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: -120, left: "50%", transform: "translateX(-50%)",
        width: 600, height: 400, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(109,40,217,0.12), transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      <div style={{
        maxWidth: 860, margin: "0 auto",
        padding: "1.5rem 1.5rem 5rem",
        position: "relative", zIndex: 1,
      }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <header style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "2rem", marginBottom: "2rem",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: 42, height: 42,
              background: "linear-gradient(135deg, var(--accent), var(--accent2))",
              borderRadius: 10, display: "grid", placeItems: "center",
              fontSize: "1.3rem",
              boxShadow: "0 0 24px var(--glow)",
            }}>🔬</div>
            <span style={{
              fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em",
              background: "linear-gradient(135deg,#fff 40%,var(--accent2))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>DeepScan</span>
          </div>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              onClick={() => setShowHistory(s => !s)}
              style={{
                background: showHistory ? "var(--surface2)" : "transparent",
                border: "1px solid var(--border)", borderRadius: 8,
                color: showHistory ? "var(--accent2)" : "var(--muted)",
                fontFamily: "var(--font-mono)", fontSize: "0.68rem",
                padding: "0.4rem 0.9rem", cursor: "pointer",
              }}
            >HISTORY</button>
            <span style={{
              border: "1px solid var(--accent)", borderRadius: 20,
              padding: "0.3rem 0.8rem", color: "var(--accent2)",
              fontFamily: "var(--font-mono)", fontSize: "0.62rem",
              letterSpacing: "0.1em",
            }}>v1.0 · AI</span>
          </div>
        </header>

        {/* ── Status bar ──────────────────────────────────────────── */}
        <div style={{ marginBottom: "1.5rem" }}>
          <StatusBar health={health} onCheck={checkHealth} />
        </div>

        {/* ── Hero ────────────────────────────────────────────────── */}
        <section style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h1 style={{
            fontSize: "clamp(1.8rem, 5vw, 3rem)",
            fontWeight: 800, letterSpacing: "-0.04em",
            lineHeight: 1.1, marginBottom: "0.8rem",
          }}>
            Detect{" "}
            <span style={{
              background: "linear-gradient(135deg, var(--accent2), #ec4899)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>Deepfakes</span>
            <br />with Neural Precision
          </h1>
          <p style={{
            color: "var(--muted)", maxWidth: 520, margin: "0 auto",
            lineHeight: 1.7, fontSize: "1rem",
          }}>
            Multi-model ensemble — ModelA (eyes/nose), ModelB (eyes/nose),
            ModelC ViT (full face), ModelD Xception (mouth) — with MTCNN face alignment.
          </p>
        </section>

        {/* ── History panel ───────────────────────────────────────── */}
        {showHistory && (
          <div style={{
            marginBottom: "2rem",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 16, padding: "1.2rem",
          }}>
            <HistoryPanel items={history} onClear={handleClearHistory} />
          </div>
        )}

        {/* ── Mode tabs ───────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: "0.4rem",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "0.35rem",
          maxWidth: 340, margin: "0 auto 2rem",
        }}>
          <button style={TAB_STYLE(mode==="image")} onClick={() => handleModeSwitch("image")}>
            🖼  Image
          </button>
          <button style={TAB_STYLE(mode==="video")} onClick={() => handleModeSwitch("video")}>
            🎬  Video
          </button>
        </div>

        {/* ── Upload zone ─────────────────────────────────────────── */}
        <UploadZone mode={mode} onFile={setFile} />

        {/* ── Video frame count ───────────────────────────────────── */}
        {mode === "video" && (
          <div style={{
            marginTop: "1.2rem",
            display: "flex", alignItems: "center", gap: "1rem",
            fontFamily: "var(--font-mono)", fontSize: "0.72rem",
            color: "var(--muted)",
          }}>
            <label>FRAMES TO SAMPLE:</label>
            <input
              type="range" min={5} max={50} value={numFrames}
              onChange={e => setNumFrames(+e.target.value)}
              style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
            />
            <span style={{ color: "var(--accent2)", fontWeight: 700, minWidth: 24 }}>
              {numFrames}
            </span>
          </div>
        )}

        {/* ── Analyze button ──────────────────────────────────────── */}
        <button
          onClick={handleAnalyze}
          disabled={!file || loading}
          style={{
            display: "block", width: "100%", marginTop: "1.4rem",
            padding: "1rem 2rem",
            background: !file || loading
              ? "var(--surface2)"
              : "linear-gradient(135deg, var(--accent), #9333ea)",
            border: "none", borderRadius: 12,
            color: !file || loading ? "var(--muted)" : "#fff",
            fontFamily: "var(--font-body)", fontWeight: 700,
            fontSize: "1.05rem", cursor: !file || loading ? "not-allowed" : "pointer",
            transition: "all 0.25s",
            boxShadow: !file || loading ? "none" : "0 6px 24px var(--glow)",
            letterSpacing: "0.02em",
          }}
        >
          {loading ? "⏳ Analyzing…" : `⚡ Analyze ${mode === "image" ? "Image" : "Video"}`}
        </button>

        {/* ── Loading indicator ───────────────────────────────────── */}
        {loading && (
          <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
            <div style={{
              width: 44, height: 44,
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              margin: "0 auto 0.8rem",
              animation: "spin 0.8s linear infinite",
            }} />
            <p style={{
              fontFamily: "var(--font-mono)", fontSize: "0.75rem",
              color: "var(--muted)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}>
              {mode === "video"
                ? "Sampling frames and running ensemble models…"
                : "Running face detection and model inference…"}
            </p>
            <style>{`
              @keyframes spin  { to { transform: rotate(360deg); } }
              @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
            `}</style>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────── */}
        {error && (
          <div style={{
            marginTop: "1.5rem",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 10, padding: "1rem 1.4rem",
            fontFamily: "var(--font-mono)", fontSize: "0.8rem",
            color: "#f87171",
          }}>
            ⚠ {error}
            {error.toLowerCase().includes("fetch") && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "var(--muted)" }}>
                Make sure Express (port 3001) and FastAPI (port 8000) are both running.
              </div>
            )}
          </div>
        )}

        {/* ── Result ──────────────────────────────────────────────── */}
        {result && !loading && (
          <div style={{ marginTop: "2rem" }}>
            <ResultCard result={result} />
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer style={{
          marginTop: "4rem", paddingTop: "1.5rem",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          fontFamily: "var(--font-mono)", fontSize: "0.7rem",
          color: "var(--muted)",
        }}>
          React + Express + FastAPI · PyTorch · MTCNN · ModelA · ModelB · ModelC ViT · ModelD
        </footer>
      </div>
    </div>
  );
}
