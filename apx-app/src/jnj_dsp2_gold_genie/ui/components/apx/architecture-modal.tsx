import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Network, X } from "lucide-react";

/**
 * Architecture / Data-Flow modal for the Bottava Predictive Maintenance demo.
 * Renders a launch button plus a dark full-screen modal containing an animated
 * SVG diagram of the end-to-end Databricks architecture.
 */

type NodeDef = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  color: keyof typeof COLORS;
};

const COLORS = {
  amber: "#F59E0B",
  teal: "#14B8A6",
  purple: "#8B5CF6",
  red: "#FF3621",
  blue: "#3B82F6",
} as const;

const NODES: NodeDef[] = [
  { id: "vol", x: 40, y: 130, w: 180, h: 56, title: "UC Volume", sub: "Robot telemetry & cases (CSV)", color: "amber" },
  { id: "bronze", x: 300, y: 130, w: 150, h: 56, title: "Bronze", sub: "raw Delta", color: "amber" },
  { id: "silver", x: 530, y: 130, w: 150, h: 56, title: "Silver", sub: "cleaned Delta", color: "teal" },
  { id: "gold", x: 760, y: 130, w: 200, h: 56, title: "Gold KPIs", sub: "gold_bottava_maintenance_kpis", color: "teal" },
  { id: "train", x: 300, y: 270, w: 170, h: 56, title: "MLflow Training", sub: "RandomForest / LogReg", color: "purple" },
  { id: "reg", x: 530, y: 270, w: 180, h: 56, title: "UC Model Registry", sub: "@Champion", color: "purple" },
  { id: "infer", x: 760, y: 270, w: 200, h: 56, title: "Batch Inference", sub: "risk_ml_probability", color: "purple" },
  { id: "lake", x: 300, y: 410, w: 190, h: 56, title: "Lakebase Postgres", sub: "synced tables", color: "red" },
  { id: "genie", x: 560, y: 410, w: 170, h: 56, title: "Genie Space", sub: "NL analytics", color: "blue" },
  { id: "llm", x: 800, y: 410, w: 190, h: 56, title: "Model Serving", sub: "databricks-gpt (LLM)", color: "red" },
  { id: "app", x: 560, y: 530, w: 190, h: 56, title: "Databricks App", sub: "FastAPI + React", color: "red" },
  { id: "dash", x: 800, y: 530, w: 190, h: 56, title: "AI/BI Dashboard", sub: "Lakeview", color: "blue" },
];

type EdgeDef = { id: string; d: string; color: keyof typeof COLORS; label?: string; lx?: number; ly?: number; dot?: boolean };

const EDGES: EdgeDef[] = [
  { id: "e_vb", d: "M220 158 H300", color: "amber", dot: true },
  { id: "e_bs", d: "M450 158 H530", color: "amber", dot: true },
  { id: "e_sg", d: "M680 158 H760", color: "teal", dot: true },
  { id: "e_gt", d: "M840 186 V228 H385 V270", color: "purple", label: "train", lx: 500, ly: 222 },
  { id: "e_tr", d: "M470 298 H530", color: "purple" },
  { id: "e_ri", d: "M710 298 H760", color: "purple", label: "champion", lx: 715, ly: 290 },
  { id: "e_gi", d: "M880 186 V270", color: "purple", label: "score", lx: 888, ly: 232, dot: true },
  { id: "e_il", d: "M820 326 V368 H395 V410", color: "red", label: "reverse ETL", lx: 405, ly: 362, dot: true },
  { id: "e_gg", d: "M960 158 V400 H645 V410", color: "blue", label: "NL over gold", lx: 660, ly: 396 },
  { id: "e_la", d: "M395 466 V498 H655 V530", color: "red", label: "reads", lx: 470, ly: 492, dot: true },
  { id: "e_ga", d: "M655 466 V530", color: "blue" },
  { id: "e_lma", d: "M800 438 H772 V558 H750", color: "red", label: "AI analysis", lx: 700, ly: 452 },
  { id: "e_gd", d: "M960 158 H1030 V558 H990", color: "blue", label: "reads gold", lx: 1000, ly: 300 },
];

const LEGEND: { c: keyof typeof COLORS; label: string }[] = [
  { c: "amber", label: "Ingest" },
  { c: "teal", label: "Medallion (Delta)" },
  { c: "purple", label: "ML training & scoring" },
  { c: "red", label: "Serving (Lakebase / App / LLM)" },
  { c: "blue", label: "Consumption (Genie / AI-BI)" },
];

function DiagramNode({ n }: { n: NodeDef }) {
  const c = COLORS[n.color];
  return (
    <div
      style={{
        position: "absolute",
        left: n.x,
        top: n.y,
        width: n.w,
        height: n.h,
        borderLeft: `3px solid ${c}`,
        background: "rgba(255,255,255,.03)",
        borderTop: "1px solid rgba(255,255,255,.08)",
        borderRight: "1px solid rgba(255,255,255,.08)",
        borderBottom: "1px solid rgba(255,255,255,.08)",
        borderRadius: 10,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        boxShadow: "0 6px 18px rgba(0,0,0,.35)",
      }}
    >
      <div style={{ color: "#F1F5F9", fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{n.title}</div>
      <div style={{ color: "#8B96A5", fontSize: 10.5, marginTop: 2, lineHeight: 1.25 }}>{n.sub}</div>
    </div>
  );
}

export function ArchitectureButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View architecture"
        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Network className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Architecture</span>
      </button>

      {open &&
        createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(5,8,15,.65)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
          }}
        >
          <div
            style={{
              background: "#0D1117",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.08)",
              boxShadow: "0 24px 80px rgba(0,0,0,.7)",
              width: "calc(100vw - 16px)",
              height: "calc(100vh - 16px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "16px 22px 14px",
                borderBottom: "1px solid rgba(255,255,255,.08)",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>Data Flow &amp; Architecture</div>
                <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 3 }}>
                  Bottava Predictive Maintenance · End-to-end Databricks Data &amp; AI
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.12)",
                  borderRadius: 6,
                  width: 30,
                  height: 30,
                  cursor: "pointer",
                  color: "#94A3B8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>
              <div style={{ position: "relative", width: 1080, height: 620, margin: "0 auto" }}>
                <svg
                  viewBox="0 0 1080 620"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => (
                      <marker key={k} id={`arw-${k}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L0,6 L8,3z" fill={COLORS[k]} opacity="0.85" />
                      </marker>
                    ))}
                    {EDGES.map((e) => (
                      <path key={`p-${e.id}`} id={e.id} d={e.d} />
                    ))}
                  </defs>

                  {/* visible edges */}
                  {EDGES.map((e) => (
                    <path
                      key={`v-${e.id}`}
                      d={e.d}
                      fill="none"
                      stroke={COLORS[e.color]}
                      strokeOpacity="0.5"
                      strokeWidth="1.5"
                      strokeDasharray="6,4"
                      markerEnd={`url(#arw-${e.color})`}
                    />
                  ))}

                  {/* edge labels */}
                  {EDGES.filter((e) => e.label).map((e) => (
                    <text
                      key={`l-${e.id}`}
                      x={e.lx}
                      y={e.ly}
                      fill={COLORS[e.color]}
                      fillOpacity="0.85"
                      fontSize="10"
                      fontWeight="700"
                      fontFamily="'JetBrains Mono', ui-monospace, monospace"
                    >
                      {e.label}
                    </text>
                  ))}

                  {/* animated flow dots on the main data path */}
                  {EDGES.filter((e) => e.dot).map((e, i) => (
                    <circle key={`d-${e.id}`} r="3.5" fill={COLORS[e.color]}>
                      <animateMotion dur="6s" repeatCount="indefinite" begin={`${i * 0.6}s`}>
                        <mpath href={`#${e.id}`} />
                      </animateMotion>
                    </circle>
                  ))}
                </svg>

                {NODES.map((n) => (
                  <DiagramNode key={n.id} n={n} />
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", marginTop: 8 }}>
                {LEGEND.map((l) => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 12, height: 3, borderRadius: 2, background: COLORS[l.c], display: "inline-block" }} />
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}

export default ArchitectureButton;
