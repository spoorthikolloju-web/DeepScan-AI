import React, { useEffect, useRef } from "react";
import FrameAnalytics from "./FrameAnalytics";   // ← new import

function StatCell({ label, value }) {
  return (
    <div style={{
      background: "var(--surface)", padding: "1.2rem 1.4rem",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "0.62rem",
        color: "var(--muted)", textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: "0.4rem",
      }}>{label}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function ConfidenceBar({ fakeRatio, verdict }) {
  const pct    = Math.round((fakeRatio ?? 0) * 100);
  const barRef = useRef(null);

  useEffect(() => {
    if (!barRef.current) return;
    setTimeout(() => { barRef.current.style.width = pct + "%"; }, 80);
  }, [pct]);

  return (
    <div style={{ padding: "1.4rem 1.6rem", borderTop: "1px solid var(--border)" }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontFamily: "var(--font-mono)", fontSize: "0.68rem",
        color: "var(--muted)", marginBottom: "0.6rem",
      }}>
        <span>FAKE PROBABILITY</span>
        <span style={{
          color: verdict === "FAKE" ? "var(--fake)" : "var(--real)",
          fontWeight: 700,
        }}>{pct}%</span>
      </div>
      <div style={{
        height: 8, background: "var(--surface2)", borderRadius: 99,
        overflow: "hidden", border: "1px solid var(--border)",
      }}>
        <div ref={barRef} style={{
          height: "100%", width: 0, borderRadius: 99,
          background: verdict === "FAKE"
            ? "linear-gradient(90deg,#ef4444,#f87171)"
            : "linear-gradient(90deg,#10b981,#34d399)",
          transition: "width 1.2s cubic-bezier(0.22,1,0.36,1)",
        }} />
      </div>
    </div>
  );
}

export default function ResultCard({ result }) {
  if (!result) return null;

  const {
    verdict, is_fake, fake_ratio, confidence,
    frames_analyzed, frames_skipped, video_fps,
    models_used, device, demo_mode, duration_ms,
    frame_log, frames, type,
  } = result;

  const isFake   = verdict === "FAKE";
  const isNoFace = verdict === "NO_FACE";

  const headerBg = isFake
    ? "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))"
    : isNoFace
    ? "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))"
    : "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))";

  const borderColor = isFake   ? "rgba(239,68,68,0.25)"
                    : isNoFace ? "rgba(245,158,11,0.25)"
                    :            "rgba(16,185,129,0.25)";

  const stats = [];
  if (type === "video") {
    stats.push(["FRAMES ANALYZED", frames_analyzed ?? "—"]);
    stats.push(["FRAMES SKIPPED",  frames_skipped  ?? "—"]);
    if (video_fps) stats.push(["VIDEO FPS", video_fps]);
  } else {
    stats.push(["FACE CONF.", confidence != null ? (confidence * 100).toFixed(1) + "%" : "—"]);
    stats.push(["INPUT", "IMAGE"]);
  }
  if (models_used) stats.push(["MODELS USED", models_used]);
  if (device)      stats.push(["DEVICE",      device.toUpperCase()]);
  if (duration_ms) stats.push(["TIME",        `${(duration_ms / 1000).toFixed(1)}s`]);

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 20, overflow: "hidden",
      animation: "slideUp 0.5s cubic-bezier(0.22,1,0.36,1) forwards",
    }}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "1.4rem",
        padding: "2rem 2rem 1.8rem",
        background: headerBg,
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <div style={{
          width: 68, height: 68, borderRadius: 16,
          background: isFake
            ? "rgba(239,68,68,0.15)" : isNoFace
            ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
          border: `1px solid ${borderColor}`,
          display: "grid", placeItems: "center",
          fontSize: "2rem", flexShrink: 0,
        }}>
          {isNoFace ? "🔍" : isFake ? "🚨" : "✅"}
        </div>
        <div>
          <div style={{
            fontSize: "2.4rem", fontWeight: 800,
            letterSpacing: "-0.04em", lineHeight: 1,
            color: isFake ? "var(--fake)" : isNoFace ? "var(--warn)" : "var(--real)",
            marginBottom: "0.35rem",
          }}>
            {verdict}
          </div>
          <div style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
            {isNoFace
              ? result.message || "No face detected in the media."
              : isFake
              ? "AI manipulation detected by ensemble models."
              : "No deepfake artifacts found — content appears authentic."}
          </div>
        </div>
      </div>

      {/* ── Stats grid ─────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`,
        gap: "1px", background: "var(--border)",
      }}>
        {stats.map(([l, v]) => <StatCell key={l} label={l} value={v} />)}
      </div>

      {/* ── Fake probability bar ────────────────────────────────────────── */}
      {fake_ratio != null && !isNoFace && (
        <ConfidenceBar fakeRatio={fake_ratio} verdict={verdict} />
      )}

      {/* ── Frame-level analytics (new) ─────────────────────────────────
            Shows when the backend returns a `frames` array (both image
            and video modes). Falls back to nothing if not present.
          ──────────────────────────────────────────────────────────────── */}
      {frames?.length > 0 && !isNoFace && (
        <div style={{ padding: "0 1.6rem 1.6rem" }}>
          <FrameAnalytics frames={frames} />
        </div>
      )}

      {/* ── Demo warning ────────────────────────────────────────────────── */}
      {demo_mode && (
        <div style={{
          padding: "0.8rem 1.4rem",
          borderTop: "1px solid rgba(245,158,11,0.2)",
          background: "rgba(245,158,11,0.06)",
          fontFamily: "var(--font-mono)", fontSize: "0.72rem",
          color: "var(--warn)",
        }}>
          ⚠ DEMO MODE — model weights not loaded. Results are randomly generated.
        </div>
      )}
    </div>
  );
}
