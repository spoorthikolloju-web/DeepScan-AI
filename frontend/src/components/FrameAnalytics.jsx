/**
 * FrameAnalytics.jsx  —  place at: src/components/FrameAnalytics.jsx
 *
 * Models your backend sends per frame:
 *   Model A – Deep CNN    | region: Eyes & Nose | confidence + accuracy
 *   Model B – Simple CNN  | region: Eyes & Nose | confidence + accuracy
 *   Model D – Xception    | region: Mouth       | confidence + accuracy
 *   Model C – ViT         | region: Full Face   | confidence + accuracy
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

// ── colour tokens (mirror index.css) ─────────────────────────────────────────
const T = {
  bg:      "#07070d", surface: "#0f0f1a", surface2: "#161625",
  border:  "#1e1e35", accent:  "#6d28d9", accent2:  "#a78bfa",
  real:    "#10b981", fake:    "#ef4444",
  text:    "#e0e0f5", muted:   "#64647a", glow:     "rgba(109,40,217,0.4)",
};

// ── per-model colours & icons ─────────────────────────────────────────────────
const MODEL_STYLE = {
  "Model A – Deep CNN (Eyes)":   { color: "#a78bfa", label: "A · Eyes",   region: "Eyes"      },
  "Model A – Deep CNN (Nose)":   { color: "#c4b5fd", label: "A · Nose",   region: "Nose"      },
  "Model B – Simple CNN (Eyes)": { color: "#38bdf8", label: "B · Eyes",   region: "Eyes"      },
  "Model B – Simple CNN (Nose)": { color: "#7dd3fc", label: "B · Nose",   region: "Nose"      },
  "Model D – Xception":          { color: "#fb923c", label: "D · Mouth",  region: "Mouth"     },
  "Model C – ViT":               { color: "#34d399", label: "C · Face",   region: "Full Face" },
};
const modelColor = (name) => MODEL_STYLE[name]?.color ?? "#a78bfa";
const modelLabel = (name) => MODEL_STYLE[name]?.label ?? name;

// ── helpers ───────────────────────────────────────────────────────────────────
const pct    = (v) => `${(v * 100).toFixed(1)}%`;
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function ensembleStats(models = []) {
  if (!models.length) return { label: "unknown", confidence: 0 };
  const fakes = models.filter((m) => m.label === "fake").length;
  return {
    label:      fakes >= models.length / 2 ? "fake" : "real",
    confidence: models.reduce((s, m) => s + (m.confidence ?? 0), 0) / models.length,
  };
}

// ── CSS keyframes (injected once) ─────────────────────────────────────────────
let _kfDone = false;
function injectKF() {
  if (_kfDone) return; _kfDone = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes _fa_in  { from{transform:translateX(105%);opacity:0} to{transform:translateX(0);opacity:1} }
    @keyframes _fa_out { from{transform:translateX(0);opacity:1}    to{transform:translateX(105%);opacity:0} }
    @keyframes _fa_fd  { from{opacity:0} to{opacity:1} }
    @keyframes _fa_bar { from{width:0} to{width:var(--bw)} }
    @keyframes _fa_sc  { from{transform:scale(.93);opacity:0} to{transform:scale(1);opacity:1} }
    @keyframes _fa_pl  { 0%,100%{opacity:1} 50%{opacity:.4} }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// VerdictBadge
// ─────────────────────────────────────────────────────────────────────────────
function VerdictBadge({ label, size = "sm" }) {
  const fake = label === "fake";
  const big  = size === "lg";
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:"0.3em",
      padding: big ? "0.38rem 0.85rem" : "0.17rem 0.46rem",
      borderRadius: 20,
      background: fake ? "rgba(239,68,68,.12)" : "rgba(16,185,129,.12)",
      border: `1px solid ${fake ? T.fake : T.real}55`,
      color:  fake ? T.fake : T.real,
      fontFamily: "var(--font-mono)",
      fontSize:   big ? "0.77rem" : "0.57rem",
      fontWeight: 700, letterSpacing: "0.08em", whiteSpace: "nowrap",
    }}>
      <span style={{
        width: big ? 8 : 5, height: big ? 8 : 5,
        borderRadius: "50%", flexShrink: 0,
        background: fake ? T.fake : T.real,
        boxShadow: `0 0 6px ${fake ? T.fake : T.real}`,
      }}/>
      {label.toUpperCase()}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated bar
// ─────────────────────────────────────────────────────────────────────────────
function Bar({ value, color, label }) {
  const w = `${clamp((value ?? 0) * 100, 0, 100).toFixed(1)}%`;
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{
        display:"flex", justifyContent:"space-between",
        fontFamily:"var(--font-mono)", fontSize:"0.64rem",
        color: T.muted, marginBottom: "0.2rem",
      }}>
        <span>{label}</span>
        <span style={{ color }}>{w}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: T.surface2, overflow:"hidden" }}>
        <div style={{
          height:"100%", borderRadius:3, background: color,
          "--bw": w, width: w,
          animation: "_fa_bar 0.6s cubic-bezier(.22,1,.36,1) forwards",
          boxShadow: `0 0 8px ${color}55`,
        }}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ModelCard — one model's result inside the drawer
// ─────────────────────────────────────────────────────────────────────────────
function ModelCard({ model, index }) {
  const fake  = model.label === "fake";
  const color = modelColor(model.name);
  return (
    <div style={{
      background: T.surface2, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10, padding: "0.85rem 1rem",
      marginBottom: "0.7rem",
      animation: `_fa_sc 0.28s ${index * 0.07}s both`,
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"0.65rem" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:"0.45rem", marginBottom:"0.25rem" }}>
            <div style={{
              width:8, height:8, borderRadius:"50%", flexShrink:0,
              background: color, boxShadow:`0 0 7px ${color}`,
            }}/>
            <span style={{
              fontFamily:"var(--font-mono)", fontSize:"0.72rem",
              color: T.text, fontWeight:700, letterSpacing:"0.03em",
            }}>{model.name}</span>
          </div>
          {/* Region chip */}
          <span style={{
            fontFamily:"var(--font-mono)", fontSize:"0.57rem",
            color: color, background: `${color}18`,
            border:`1px solid ${color}44`, borderRadius:20,
            padding:"0.11rem 0.5rem", letterSpacing:"0.06em",
          }}>{model.region}</span>
        </div>
        <VerdictBadge label={model.label}/>
      </div>

      <Bar value={model.confidence} color={fake ? T.fake : T.real} label="CONFIDENCE"/>
      {model.accuracy != null && (
        <Bar value={model.accuracy} color={color} label="ACCURACY (val-set)"/>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RegionSummary — Eyes & Nose / Full Face / Mouth pills
// ─────────────────────────────────────────────────────────────────────────────
function RegionSummary({ models }) {
  const regions = ["Eyes", "Nose", "Mouth", "Full Face"]
    .map(label => ({ label, models: models.filter(m => m.region === label) }))
    .filter(r => r.models.length > 0);

  return (
    <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap", marginBottom:"1rem" }}>
      {regions.map(({ label, models: rm }) => {
        const avgConf = rm.reduce((s,m)=>s+m.confidence,0)/rm.length;
        const fakes   = rm.filter(m=>m.label==="fake").length;
        const verdict = fakes >= rm.length/2 ? "fake":"real";
        const fake    = verdict === "fake";
        return (
          <div key={label} style={{
            flex:1, minWidth:110,
            background: T.surface2,
            border:`1px solid ${fake ? T.fake+"33" : T.real+"33"}`,
            borderRadius:8, padding:"0.45rem 0.75rem",
          }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.56rem", color:T.muted, marginBottom:"0.25rem", letterSpacing:"0.07em" }}>
              {label.toUpperCase()}
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.7rem", fontWeight:700, color: fake ? T.fake : T.real }}>
                {pct(avgConf)}
              </span>
              <VerdictBadge label={verdict}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison bar chart
// ─────────────────────────────────────────────────────────────────────────────
function CompChart({ models }) {
  return (
    <div style={{
      marginTop:"0.8rem",
      background:T.surface2, border:`1px solid ${T.border}`,
      borderRadius:10, padding:"0.85rem 1rem",
    }}>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:T.muted, letterSpacing:"0.1em", marginBottom:"0.75rem" }}>
        CONFIDENCE COMPARISON
      </div>
      {models.map((m) => {
        const fake  = m.label === "fake";
        const color = modelColor(m.name);
        return (
          <div key={m.name} style={{ display:"flex", alignItems:"center", gap:"0.55rem", marginBottom:"0.45rem" }}>
            <div style={{
              width:80, flexShrink:0, textAlign:"right",
              fontFamily:"var(--font-mono)", fontSize:"0.57rem", color:T.muted,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
            }}>{modelLabel(m.name)}</div>
            <div style={{ flex:1, position:"relative", height:14 }}>
              <div style={{ position:"absolute", inset:0, borderRadius:3, background:T.surface }}/>
              <div style={{
                position:"absolute", top:0, left:0, bottom:0, borderRadius:3,
                background: fake ? T.fake : T.real,
                width: pct(m.confidence), opacity:.85,
              }}/>
              {/* model colour dot */}
              <div style={{
                position:"absolute", top:"50%", transform:"translateY(-50%)",
                right:4, width:4, height:4, borderRadius:"50%", background:color,
              }}/>
            </div>
            <div style={{
              fontFamily:"var(--font-mono)", fontSize:"0.58rem",
              color: fake ? T.fake : T.real,
              minWidth:38, textAlign:"right", flexShrink:0,
            }}>{pct(m.confidence)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail
// ─────────────────────────────────────────────────────────────────────────────
function Thumb({ frame }) {
  if (frame.thumbnail) {
    return <img src={frame.thumbnail} alt={`frame ${frame.id}`}
      style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}/>;
  }
  return (
    <div style={{
      width:"100%", height:"100%", display:"grid", placeItems:"center",
      background:`linear-gradient(135deg,${T.surface2},${T.surface})`,
      fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:T.muted,
    }}>
      F{String(frame.id).padStart(3,"0")}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid tile
// ─────────────────────────────────────────────────────────────────────────────
function Tile({ frame, selected, onClick }) {
  const { label, confidence } = ensembleStats(frame.models);
  const fake = label === "fake";
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all:"unset", cursor:"pointer",
        display:"flex", flexDirection:"column",
        borderRadius:8, overflow:"hidden",
        border:`1.5px solid ${selected ? T.accent2 : fake ? T.fake+"55" : T.real+"44"}`,
        background: T.surface,
        boxShadow: selected ? `0 0 0 2px ${T.accent}, 0 0 18px ${T.glow}` : "none",
        transform:  selected ? "scale(1.04)" : hov ? "scale(1.025)" : "scale(1)",
        transition: "transform .14s, box-shadow .18s, border-color .18s",
        position:"relative",
      }}
    >
      <div style={{ width:"100%", aspectRatio:"16/9", overflow:"hidden", background:T.surface2, flexShrink:0 }}>
        <Thumb frame={frame}/>
      </div>
      <div style={{ padding:"4px 6px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:4 }}>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.57rem", color:T.muted, flexShrink:0 }}>
          {frame.timestamp != null ? `${frame.timestamp.toFixed(1)}s` : `#${frame.id}`}
        </span>
        <VerdictBadge label={label}/>
      </div>
      {/* confidence strip */}
      <div style={{ height:3, background:T.surface2, flexShrink:0 }}>
        <div style={{ height:"100%", width:pct(confidence), background: fake ? T.fake : T.real, transition:"width .4s" }}/>
      </div>
      {selected && (
        <div style={{
          position:"absolute", top:5, left:5,
          width:7, height:7, borderRadius:"50%",
          background:T.accent2, boxShadow:`0 0 8px ${T.accent2}`,
        }}/>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sliding Drawer
// ─────────────────────────────────────────────────────────────────────────────
function Drawer({ frame, onClose }) {
  const [closing, setClosing] = useState(false);
  const cbRef = useRef(onClose);
  cbRef.current = onClose;

  useEffect(() => { if (frame) setClosing(false); }, [frame]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); cbRef.current(); }, 310);
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [close]);

  if (!frame) return null;

  const { label: eLabel, confidence: eConf } = ensembleStats(frame.models);
  const fake      = eLabel === "fake";
  const fakeVotes = frame.models.filter(m => m.label === "fake").length;
  const realVotes = frame.models.length - fakeVotes;

  return (
    <>
      {/* Backdrop */}
      <div onClick={close} style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(0,0,0,0.58)", backdropFilter:"blur(2px)",
        animation:"_fa_fd 0.2s ease",
        opacity: closing ? 0 : 1,
        transition: closing ? "opacity 0.28s ease" : "none",
        pointerEvents: closing ? "none" : "auto",
      }}/>

      {/* Panel */}
      <div style={{
        position:"fixed", top:0, right:0, bottom:0, zIndex:1001,
        width:"min(460px,95vw)",
        background:T.surface, borderLeft:`1px solid ${T.border}`,
        display:"flex", flexDirection:"column", overflowY:"auto",
        boxShadow:"-12px 0 60px rgba(0,0,0,0.7)",
        animation: closing
          ? "_fa_out 0.3s cubic-bezier(.4,0,1,1) forwards"
          : "_fa_in  0.35s cubic-bezier(.22,1,.36,1) forwards",
      }}>

        {/* sticky header */}
        <div style={{
          padding:"12px 18px", borderBottom:`1px solid ${T.border}`,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          position:"sticky", top:0, background:T.surface, zIndex:2, flexShrink:0,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.65rem", color:T.muted, letterSpacing:"0.08em" }}>
              {frame.timestamp != null ? `${frame.timestamp.toFixed(2)}s` : `FRAME #${frame.id}`}
            </span>
            <VerdictBadge label={eLabel}/>
          </div>
          <button onClick={close} aria-label="Close" style={{
            all:"unset", cursor:"pointer",
            width:28, height:28, borderRadius:"50%",
            display:"grid", placeItems:"center",
            color:T.muted, fontSize:"1.1rem",
            border:`1px solid ${T.border}`,
            transition:"background .15s, color .15s",
          }}
            onMouseEnter={e=>{e.currentTarget.style.background=T.surface2;e.currentTarget.style.color=T.text;}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.muted;}}
          >×</button>
        </div>

        {/* body */}
        <div style={{ padding:"1.2rem 1.4rem", flex:1 }}>

          {/* thumbnail */}
          <div style={{
            width:"100%", aspectRatio:"16/9", borderRadius:10,
            overflow:"hidden", marginBottom:"1.1rem",
            border:`1px solid ${fake ? T.fake+"44" : T.real+"44"}`,
            boxShadow:`0 0 24px ${fake ? "rgba(239,68,68,.1)" : "rgba(16,185,129,.08)"}`,
          }}>
            <Thumb frame={frame}/>
          </div>

          {/* Ensemble verdict */}
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            background:T.surface2,
            border:`1px solid ${fake ? T.fake+"33" : T.real+"33"}`,
            borderRadius:10, padding:"0.9rem 1.1rem", marginBottom:"1rem",
          }}>
            <div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:T.muted, marginBottom:"0.3rem", letterSpacing:"0.1em" }}>
                ENSEMBLE VERDICT
              </div>
              <VerdictBadge label={eLabel} size="lg"/>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:T.muted, marginBottom:"0.2rem", letterSpacing:"0.1em" }}>
                AVG CONFIDENCE
              </div>
              <span style={{ fontSize:"1.55rem", fontWeight:800, letterSpacing:"-0.03em", color: fake ? T.fake : T.real }}>
                {pct(eConf)}
              </span>
            </div>
          </div>

          {/* vote tally */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.6rem", marginBottom:"1.1rem" }}>
            {[
              { l:"FAKE VOTES", v:fakeVotes, c:T.fake  },
              { l:"REAL VOTES", v:realVotes, c:T.real  },
              { l:"MODELS",     v:frame.models.length, c:T.muted },
            ].map(({ l, v, c }) => (
              <div key={l} style={{
                textAlign:"center", background:T.surface2,
                border:`1px solid ${T.border}`, borderRadius:8, padding:"0.6rem 0.5rem",
              }}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:"1.35rem", fontWeight:800, color:c }}>{v}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.54rem", color:T.muted, marginTop:"0.2rem", letterSpacing:"0.08em" }}>{l}</div>
              </div>
            ))}
          </div>

          {/* region summary */}
          <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:T.muted, letterSpacing:"0.1em", marginBottom:"0.6rem" }}>
            REGION SUMMARY
          </div>
          <RegionSummary models={frame.models}/>

          {/* per-model cards */}
          <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:T.muted, letterSpacing:"0.1em", marginBottom:"0.7rem" }}>
            MODEL BREAKDOWN
          </div>
          {frame.models.map((m, i) => (
            <ModelCard key={m.name} model={m} index={i}/>
          ))}

          {/* comparison chart */}
          {frame.models.length > 1 && <CompChart models={frame.models}/>}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export default function FrameAnalytics({ frames = [] }) {
  const [selectedId, setSelectedId] = useState(null);
  const [filter,     setFilter]     = useState("all");
  const [sort,       setSort]       = useState("id");
  const [sortDir,    setSortDir]    = useState("asc");

  useEffect(() => { injectKF(); }, []);

  const fakeCount = frames.filter(f => ensembleStats(f.models).label === "fake").length;
  const realCount = frames.length - fakeCount;
  const fakeRatio = frames.length ? fakeCount / frames.length : 0;
  const selectedFrame = frames.find(f => f.id === selectedId) ?? null;

  const filtered = frames.filter(f =>
    filter === "all" || ensembleStats(f.models).label === filter
  );

  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if      (sort === "conf") { va = ensembleStats(a.models).confidence; vb = ensembleStats(b.models).confidence; }
    else if (sort === "ts")   { va = a.timestamp ?? a.id; vb = b.timestamp ?? b.id; }
    else                      { va = a.id; vb = b.id; }
    return sortDir === "asc" ? va - vb : vb - va;
  });

  const toggleSort = (key) => {
    if (sort === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(key); setSortDir("asc"); }
  };

  const FilterBtn = ({ id, label }) => (
    <button onClick={() => setFilter(id)} style={{
      all:"unset", cursor:"pointer",
      padding:"0.22rem 0.7rem", borderRadius:6,
      background: filter === id ? T.surface2 : "transparent",
      border: `1px solid ${filter === id ? T.border : "transparent"}`,
      fontFamily:"var(--font-mono)", fontSize:"0.63rem",
      color: filter === id
        ? (id === "fake" ? T.fake : id === "real" ? T.real : T.text)
        : T.muted,
      fontWeight: filter === id ? 700 : 400,
      textTransform:"uppercase", transition:"all .14s",
    }}>{label}</button>
  );

  const SortBtn = ({ id, label }) => (
    <button onClick={() => toggleSort(id)} style={{
      all:"unset", cursor:"pointer",
      padding:"0.22rem 0.65rem", borderRadius:6,
      background: sort === id ? T.surface2 : T.surface,
      border:`1px solid ${sort === id ? T.accent+"55" : T.border}`,
      fontFamily:"var(--font-mono)", fontSize:"0.61rem",
      color: sort === id ? T.accent2 : T.muted,
      transition:"all .14s",
    }}>
      {label}{sort === id ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <div style={{ marginTop:"1.5rem" }}>

      {/* header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", flexWrap:"wrap", gap:"0.5rem" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
          <div style={{
            width:20, height:20, borderRadius:5, flexShrink:0,
            background:`linear-gradient(135deg,${T.accent},${T.accent2})`,
            display:"grid", placeItems:"center", fontSize:"0.65rem",
          }}>▦</div>
          <span style={{ fontSize:"0.88rem", fontWeight:700, letterSpacing:"-0.02em" }}>Frame-Level Analytics</span>
          <span style={{
            fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:T.muted,
            border:`1px solid ${T.border}`, borderRadius:20, padding:"0.14rem 0.55rem",
          }}>{frames.length} frames</span>
        </div>
        <div style={{
          padding:"0.28rem 0.9rem", borderRadius:20,
          background: fakeRatio > 0.5 ? "rgba(239,68,68,.1)" : "rgba(16,185,129,.1)",
          border:`1px solid ${fakeRatio > 0.5 ? T.fake : T.real}44`,
          fontFamily:"var(--font-mono)", fontSize:"0.68rem", fontWeight:700,
          color: fakeRatio > 0.5 ? T.fake : T.real,
        }}>
          {(fakeRatio*100).toFixed(0)}% FAKE · {((1-fakeRatio)*100).toFixed(0)}% REAL
        </div>
      </div>

      {/* summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.6rem", marginBottom:"1rem" }}>
        {[
          { l:"TOTAL FRAMES", v:frames.length, c:T.accent2 },
          { l:"FAKE FRAMES",  v:fakeCount,     c:T.fake    },
          { l:"REAL FRAMES",  v:realCount,     c:T.real    },
        ].map(({ l, v, c }) => (
          <div key={l} style={{
            textAlign:"center", background:T.surface,
            border:`1px solid ${T.border}`, borderRadius:10, padding:"0.7rem 0.9rem",
          }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.57rem", color:T.muted, letterSpacing:"0.1em", marginBottom:"0.3rem" }}>{l}</div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:"1.5rem", fontWeight:800, color:c, letterSpacing:"-0.03em" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap", alignItems:"center", marginBottom:"0.9rem" }}>
        <div style={{ display:"flex", gap:"0.2rem", background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:"0.2rem" }}>
          <FilterBtn id="all"  label="All"/>
          <FilterBtn id="fake" label="Fake"/>
          <FilterBtn id="real" label="Real"/>
        </div>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.59rem", color:T.muted }}>SORT:</span>
        <SortBtn id="id"   label="ID"/>
        <SortBtn id="ts"   label="Time"/>
        <SortBtn id="conf" label="Confidence"/>
        <span style={{ marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize:"0.59rem", color:T.muted }}>
          {sorted.length} / {frames.length}
        </span>
      </div>

      {/* grid */}
      {sorted.length === 0 ? (
        <div style={{
          textAlign:"center", padding:"3rem",
          fontFamily:"var(--font-mono)", fontSize:"0.76rem", color:T.muted,
          border:`1px dashed ${T.border}`, borderRadius:12,
        }}>No frames match the current filter.</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(128px,1fr))", gap:"0.6rem" }}>
          {sorted.map(f => (
            <Tile
              key={f.id} frame={f}
              selected={f.id === selectedId}
              onClick={() => setSelectedId(f.id === selectedId ? null : f.id)}
            />
          ))}
        </div>
      )}

      <p style={{
        marginTop:"0.75rem", textAlign:"center",
        fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:T.muted,
        animation:"_fa_pl 2.5s ease-in-out infinite",
      }}>
        Click any frame to inspect per-model scores · Esc to dismiss
      </p>

      <Drawer frame={selectedFrame} onClose={() => setSelectedId(null)}/>
    </div>
  );
}
