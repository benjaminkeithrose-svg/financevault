import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Graph, GraphNode } from "../api/client.js";
import { formatCurrency, humanize } from "../utils.js";

const LEVEL_BY_TYPE: Record<GraphNode["type"], number> = {
  PERSON: 0,
  ENTITY: 1,
  ASSET: 2,
  ACCOUNT: 2,
  INVESTMENT: 2,
  LIABILITY: 3,
};

const LEVEL_LABELS = ["People", "Entities", "Assets & Accounts", "Liabilities"];

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

const NODE_WIDTH = 190;
const NODE_HEIGHT = 70;
const H_GAP = 32;
const V_GAP = 110;
const PADDING = 40;

interface Positioned extends GraphNode {
  x: number;
  y: number;
}

export function Visualization() {
  const [graph, setGraph] = useState<Graph | null>(null);
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

    const rows = byLevel
      .map((nodes, levelIndex) => ({ nodes, label: LEVEL_LABELS[levelIndex] }))
      .filter((row) => row.nodes.length > 0);

    const rowWidths = rows.map((row) => row.nodes.length * (NODE_WIDTH + H_GAP) - H_GAP);
    const canvasWidth = Math.max(...rowWidths, 400) + PADDING * 2 + 60;
    const canvasHeight = rows.length * (NODE_HEIGHT + V_GAP) + PADDING;

    const positions = new Map<string, Positioned>();
    const rowLabels: Array<{ label: string; y: number }> = [];
    rows.forEach((row, rowIndex) => {
      const rowWidth = rowWidths[rowIndex];
      const y = PADDING + rowIndex * (NODE_HEIGHT + V_GAP);
      const startX = 60 + (canvasWidth - 60 - rowWidth) / 2;
      rowLabels.push({ label: row.label, y: y + NODE_HEIGHT / 2 });
      row.nodes.forEach((node, i) => {
        positions.set(node.id, { ...node, x: startX + i * (NODE_WIDTH + H_GAP), y });
      });
    });

    return { positions, canvasWidth, canvasHeight, rowLabels };
  }, [graph]);

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
      </div>
    );
  }

  const { positions, canvasWidth, canvasHeight, rowLabels } = layout!;

  function edgePath(fromId: string, toId: string): string | null {
    const from = positions.get(fromId);
    const to = positions.get(toId);
    if (!from || !to) return null;
    const x1 = from.x + NODE_WIDTH / 2;
    const y1 = from.y + (to.y > from.y ? NODE_HEIGHT : 0);
    const x2 = to.x + NODE_WIDTH / 2;
    const y2 = to.y + (to.y > from.y ? 0 : NODE_HEIGHT);
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Visualization</h2>
          <p>Your ownership structure as a diagram. Click any node to open it.</p>
        </div>
      </div>

      <div className="toolbar">
        {Object.entries(TYPE_COLOR)
          .filter(([type]) => !["ACCOUNT", "INVESTMENT"].includes(type))
          .map(([type, color]) => (
            <span key={type} className="tag" style={{ borderLeft: `3px solid ${color}` }}>
              {TYPE_ICON[type as GraphNode["type"]]} {humanize(type)}
            </span>
          ))}
      </div>

      <div className="card" style={{ overflowX: "auto", padding: 0 }}>
        <div style={{ position: "relative", width: canvasWidth, height: canvasHeight, margin: "0 auto" }}>
          <svg width={canvasWidth} height={canvasHeight} style={{ position: "absolute", top: 0, left: 0 }}>
            {graph.edges.map((e, i) => {
              const d = edgePath(e.from, e.to);
              if (!d) return null;
              return <path key={i} d={d} fill="none" stroke="#3a4568" strokeWidth={1.5} />;
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
                background: "var(--surface-2)",
                border: `1px solid ${TYPE_COLOR[n.type]}`,
                borderLeft: `4px solid ${TYPE_COLOR[n.type]}`,
                borderRadius: 8,
                padding: "8px 10px",
                cursor: n.route ? "pointer" : "default",
                boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
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
  );
}
