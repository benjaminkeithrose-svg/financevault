import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Graph, GraphNode } from "../api/client.js";
import { formatCurrency, humanize } from "../utils.js";
import { ExpiryCalendar } from "../components/ExpiryCalendar.js";
import { IconFit, IconMinus, IconPlus } from "../components/icons.js";

const LEVEL_BY_TYPE: Record<GraphNode["type"], number> = {
  PERSON: 0,
  ENTITY: 1,
  ASSET: 2,
  ACCOUNT: 2,
  INVESTMENT: 2,
  LIABILITY: 3,
};

const LEVEL_LABELS = ["People", "Structures", "Assets", "Liabilities"];

const TYPE_COLOR: Record<GraphNode["type"], string> = {
  PERSON: "#4f8cff",
  ENTITY: "#35c98f",
  ASSET: "#f0b429",
  ACCOUNT: "#f0b429",
  INVESTMENT: "#f0b429",
  LIABILITY: "#f0616d",
};

const TYPE_ICON: Record<GraphNode["type"], string> = {
  PERSON: "🧑",
  ENTITY: "🏛️",
  ASSET: "📦",
  ACCOUNT: "💵",
  INVESTMENT: "📈",
  LIABILITY: "🏦",
};

const LEGEND_LABEL: Record<string, string> = {
  PERSON: "Person",
  ENTITY: "Trust, company or fund",
  ASSET: "Asset",
  LIABILITY: "Liability",
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 70;
const H_GAP = 20;
const V_GAP = 80;
const SUBROW_GAP = 24;
const PADDING = 32;
// A level with more boxes than this wraps onto another line, so the diagram
// grows downward rather than off the side of the screen.
const MAX_PER_ROW = 6;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;

interface Positioned extends GraphNode {
  x: number;
  y: number;
}

export function Visualization() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.graph().then(setGraph);
  }, []);

  const layout = useMemo(() => {
    if (!graph) return null;

    const byLevel: GraphNode[][] = [[], [], [], []];
    for (const n of graph.nodes) {
      byLevel[LEVEL_BY_TYPE[n.type]].push(n);
    }
    for (const level of byLevel) level.sort((a, b) => a.label.localeCompare(b.label));

    const levels = byLevel
      .map((nodes, levelIndex) => ({ nodes, label: LEVEL_LABELS[levelIndex] }))
      .filter((level) => level.nodes.length > 0);

    const perRow = Math.min(MAX_PER_ROW, Math.max(...levels.map((l) => l.nodes.length), 1));
    const canvasWidth = Math.max(perRow * (NODE_WIDTH + H_GAP) - H_GAP, 400) + PADDING * 2 + 60;

    const positions = new Map<string, Positioned>();
    const rowLabels: Array<{ label: string; y: number }> = [];
    // Room above the top row for the arcs linking family members.
    let y = PADDING + 44;
    for (const level of levels) {
      const lines: GraphNode[][] = [];
      for (let i = 0; i < level.nodes.length; i += MAX_PER_ROW) lines.push(level.nodes.slice(i, i + MAX_PER_ROW));
      rowLabels.push({ label: level.label, y: y + NODE_HEIGHT / 2 });
      lines.forEach((line, lineIndex) => {
        const lineWidth = line.length * (NODE_WIDTH + H_GAP) - H_GAP;
        const startX = 60 + (canvasWidth - 60 - lineWidth) / 2;
        line.forEach((node, i) => positions.set(node.id, { ...node, x: startX + i * (NODE_WIDTH + H_GAP), y }));
        y += NODE_HEIGHT + (lineIndex < lines.length - 1 ? SUBROW_GAP : V_GAP);
      });
    }
    const canvasHeight = y - V_GAP + NODE_HEIGHT + PADDING;

    return { positions, canvasWidth, canvasHeight, rowLabels };
  }, [graph]);

  // Fit the whole diagram to the screen width when it first loads.
  function fitZoom(): number {
    if (!layout || !frameRef.current) return 1;
    const available = frameRef.current.clientWidth;
    return Math.max(MIN_ZOOM, Math.min(1, available / layout.canvasWidth));
  }
  useLayoutEffect(() => {
    if (layout && zoom === null) setZoom(fitZoom());
  });

  if (!graph) return <div className="empty-state">Loading…</div>;
  if (graph.nodes.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h2>Visualization</h2>
            <p>Your ownership structure as a diagram — people, entities, what they own, and what they owe.</p>
          </div>
        </div>
        <div className="placeholder-page">
          <p>Nothing to show yet. Add a person, an entity, and something the entity owns, and it'll appear here.</p>
        </div>
        <ExpiryCalendar />
      </div>
    );
  }

  const { positions, canvasWidth, canvasHeight, rowLabels } = layout!;

  const scale = zoom ?? 1;

  function edgePath(fromId: string, toId: string): string | null {
    const from = positions.get(fromId);
    const to = positions.get(toId);
    if (!from || !to) return null;
    // Same line (e.g. partners): an arc over the top of both boxes.
    if (from.y === to.y) {
      const xa = from.x + NODE_WIDTH / 2;
      const xb = to.x + NODE_WIDTH / 2;
      const lift = 16 + Math.min(26, Math.abs(xb - xa) / 10);
      return `M ${xa} ${from.y} C ${xa} ${from.y - lift}, ${xb} ${to.y - lift}, ${xb} ${to.y}`;
    }
    const x1 = from.x + NODE_WIDTH / 2;
    const y1 = from.y + (to.y > from.y ? NODE_HEIGHT : 0);
    const x2 = to.x + NODE_WIDTH / 2;
    const y2 = to.y + (to.y > from.y ? 0 : NODE_HEIGHT);
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  }

  return (
    <div className="viz-page">
      <div className="page-header">
        <div>
          <h2>Visualization</h2>
          <p>Your ownership structure as a diagram. Click any box to open it.</p>
        </div>
        <div className="toolbar zoom-controls">
          <button className="icon-btn" aria-label="Zoom out" onClick={() => setZoom(Math.max(MIN_ZOOM, scale - 0.15))}>
            <IconMinus />
          </button>
          <button className="icon-btn" aria-label="Fit to screen" onClick={() => setZoom(fitZoom())}>
            <IconFit />
          </button>
          <button className="icon-btn" aria-label="Zoom in" onClick={() => setZoom(Math.min(MAX_ZOOM, scale + 0.15))}>
            <IconPlus />
          </button>
        </div>
      </div>

      <div className="toolbar">
        {Object.entries(TYPE_COLOR)
          .filter(([type]) => !["ACCOUNT", "INVESTMENT"].includes(type))
          .map(([type, color]) => (
            <span key={type} className="tag" style={{ borderLeft: `3px solid ${color}` }}>
              {TYPE_ICON[type as GraphNode["type"]]} {LEGEND_LABEL[type] ?? humanize(type)}
            </span>
          ))}
      </div>

      <div className="card viz-frame" ref={frameRef}>
        <div style={{ width: canvasWidth * scale, height: canvasHeight * scale, margin: "0 auto" }}>
        <div
          style={{
            position: "relative",
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <svg width={canvasWidth} height={canvasHeight} style={{ position: "absolute", top: 0, left: 0 }}>
            {graph.edges.map((e, i) => {
              const d = edgePath(e.from, e.to);
              if (!d) return null;
              const family = e.label === "Partner" || e.label === "Parent of";
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={family ? TYPE_COLOR.PERSON : "var(--text-muted)"}
                  strokeWidth={1.5}
                  strokeDasharray={family ? "5 4" : undefined}
                  opacity={0.7}
                >
                  {e.label && <title>{humanize(e.label)}</title>}
                </path>
              );
            })}
          </svg>

          {rowLabels.map((r) => (
            <div
              key={r.label}
              style={{
                position: "absolute",
                left: 0,
                top: r.y - 8,
                width: 50,
                fontSize: 11,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                writingMode: "vertical-rl",
              }}
            >
              {r.label}
            </div>
          ))}

          {Array.from(positions.values()).map((n) => (
            <div
              key={n.id}
              onClick={() => n.route && navigate(n.route)}
              style={{
                position: "absolute",
                left: n.x,
                top: n.y,
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
                background: "var(--surface)",
                border: `1px solid ${TYPE_COLOR[n.type]}`,
                borderLeft: `4px solid ${TYPE_COLOR[n.type]}`,
                borderRadius: 8,
                padding: "8px 10px",
                cursor: n.route ? "pointer" : "default",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
              title={n.route ? "Click to open" : undefined}
            >
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {TYPE_ICON[n.type]} {n.sublabel ? humanize(n.sublabel) : humanize(n.type)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, lineHeight: 1.3 }}>{n.label}</div>
              {n.value !== null && n.value !== undefined && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{formatCurrency(n.value)}</div>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>

      <ExpiryCalendar />
    </div>
  );
}
