import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AssetTreeData, TreeNode } from "../api/client.js";
import { HelpLink } from "../components/HelpLink.js";
import { LoadFailed } from "../components/LoadFailed.js";
import { entityTypeLabel, formatCurrency, humanize } from "../utils.js";

/**
 * The asset tree: people → the structures they own through → assets → the
 * items under them, with loans, insurance, documents and servicing hanging
 * off each. Folded like an outline; what's open is remembered.
 */

const OPEN_KEY = "fv-tree-open";

const ICONS: Record<string, string> = {
  PERSON: "🧑",
  ENTITY: "🏛️",
  ASSET: "📦",
  PROPERTY: "🏠",
  ITEM: "🔧",
  LOAN: "🏦",
  ACCOUNT: "💵",
  INVESTMENT: "📈",
  POLICY: "🛡️",
  GROUP: "📁",
  ENTITY_REF: "🧩",
};

function readOpen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function saveOpen(open: Set<string>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {
    /* the tree still works, it just won't remember */
  }
}

export function AssetTree() {
  const [data, setData] = useState<AssetTreeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => readOpen() ?? new Set());

  useEffect(() => {
    api.tree
      .get()
      .then((d) => {
        setData(d);
        // First visit: open each person so the next level shows.
        if (!readOpen()) setOpen(new Set(d.people.map((p) => `person:${p.id}`)));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (data) saveOpen(open);
  }, [open, data]);

  if (error) return <LoadFailed message={error} backTo="/" backLabel="Back to the dashboard" />;
  if (!data) return <p className="empty-state">Loading the tree…</p>;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Every key the tree could open, for "Open everything". Units can point
  // back up the tree, so each path stops at an entity it has already passed.
  function allKeys(): Set<string> {
    const keys = new Set<string>();
    const walk = (nodes: TreeNode[], path: string, seen: string[]) => {
      for (const n of nodes) {
        const key = `${path}/${n.id}`;
        const kids = n.kind === "ENTITY_REF" && n.entityId && !seen.includes(n.entityId) ? data!.entities[n.entityId]?.children ?? [] : n.children;
        if (kids.length) {
          keys.add(key);
          walk(kids, key, n.entityId ? [...seen, n.entityId] : seen);
        }
      }
    };
    for (const p of data!.people) {
      const pk = `person:${p.id}`;
      keys.add(pk);
      keys.add(`${pk}/own`);
      if (p.ownEntityId) walk(data!.entities[p.ownEntityId]?.children ?? [], `${pk}/own`, [p.ownEntityId]);
      for (const s of p.structures) {
        const sk = `${pk}/entity:${s.entityId}`;
        keys.add(sk);
        walk(data!.entities[s.entityId]?.children ?? [], sk, [s.entityId]);
      }
    }
    for (const id of data!.unlinked) {
      keys.add(`unlinked/entity:${id}`);
      walk(data!.entities[id]?.children ?? [], `unlinked/entity:${id}`, [id]);
    }
    keys.add("unlinked");
    return keys;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Asset tree <HelpLink topic="asset-tree" />
          </h2>
          <p>
            Who owns what: each person, the structures they own through, every asset and the items under it — with the
            loans, insurance, documents and servicing that hang off each one.
          </p>
        </div>
      </div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button className="btn secondary" onClick={() => setOpen(allKeys())}>
          Open everything
        </button>
        <button className="btn secondary" onClick={() => setOpen(new Set())}>
          Fold up
        </button>
      </div>

      <div className="card tree-card">
        <div className="tree-total">
          <span>Whole family</span>
          <strong>{formatCurrency(data.familyNet)}</strong>
        </div>
        {data.people.length === 0 && data.unlinked.length === 0 ? (
          <p className="empty-state">
            Nothing here yet. Start by adding the people in your family under <Link to="/people">People & entities</Link>.
          </p>
        ) : (
          <ul className="tree">
            {data.people.map((p) => {
              const pk = `person:${p.id}`;
              const own = p.ownEntityId ? data.entities[p.ownEntityId]?.children ?? [] : [];
              return (
                <Row
                  key={pk}
                  icon={ICONS.PERSON}
                  label={p.name}
                  route={p.route}
                  sublabel="Person"
                  value={p.value}
                  valueNote="their own share"
                  level={0}
                  isOpen={open.has(pk)}
                  onToggle={() => toggle(pk)}
                  hasChildren
                >
                  <Row
                    icon={ICONS.GROUP}
                    label="In their own name"
                    level={1}
                    isOpen={open.has(`${pk}/own`)}
                    onToggle={() => toggle(`${pk}/own`)}
                    hasChildren={own.length + p.ownPolicies.length > 0}
                    emptyNote="Nothing in their own name yet"
                  >
                    <Nodes nodes={[...own, ...p.ownPolicies]} path={`${pk}/own`} level={2} data={data} open={open} toggle={toggle} seen={p.ownEntityId ? [p.ownEntityId] : []} />
                  </Row>
                  {p.structures.map((s) => {
                    const e = data.entities[s.entityId];
                    if (!e) return null;
                    const sk = `${pk}/entity:${s.entityId}`;
                    return (
                      <Row
                        key={sk}
                        icon={ICONS.ENTITY}
                        label={e.name}
                        route={e.route}
                        sublabel={`${s.roles.map((r) => humanize(r)).join(", ")} · ${entityTypeLabel(e.type)}`}
                        value={e.value}
                        level={1}
                        isOpen={open.has(sk)}
                        onToggle={() => toggle(sk)}
                        hasChildren={e.children.length > 0}
                        emptyNote="Nothing recorded under it yet"
                      >
                        <Nodes nodes={e.children} path={sk} level={2} data={data} open={open} toggle={toggle} seen={[s.entityId]} />
                      </Row>
                    );
                  })}
                </Row>
              );
            })}
            {data.unlinked.length > 0 && (
              <Row
                icon={ICONS.GROUP}
                label="Structures not linked to anyone yet"
                sublabel="Link a person to them from the person's page"
                level={0}
                isOpen={open.has("unlinked")}
                onToggle={() => toggle("unlinked")}
                hasChildren
              >
                {data.unlinked.map((id) => {
                  const e = data.entities[id];
                  const k = `unlinked/entity:${id}`;
                  return (
                    <Row
                      key={k}
                      icon={ICONS.ENTITY}
                      label={e.name}
                      route={e.route}
                      sublabel={entityTypeLabel(e.type)}
                      value={e.value}
                      level={1}
                      isOpen={open.has(k)}
                      onToggle={() => toggle(k)}
                      hasChildren={e.children.length > 0}
                      emptyNote="Nothing recorded under it yet"
                    >
                      <Nodes nodes={e.children} path={k} level={2} data={data} open={open} toggle={toggle} seen={[id]} />
                    </Row>
                  );
                })}
              </Row>
            )}
          </ul>
        )}
      </div>
      <p className="cap-explain">
        A person's figure is what's theirs: their own things, their share of anything shared and of any unit trust. A
        structure's figure is its own balance sheet. Items under an asset show what they cost; their value is part of the
        asset's.
      </p>
    </div>
  );
}

function Nodes({
  nodes,
  path,
  level,
  data,
  open,
  toggle,
  seen,
}: {
  nodes: TreeNode[];
  path: string;
  level: number;
  data: AssetTreeData;
  open: Set<string>;
  toggle: (k: string) => void;
  seen: string[];
}) {
  return (
    <>
      {nodes.map((n) => {
        const key = `${path}/${n.id}`;
        const refTarget = n.kind === "ENTITY_REF" && n.entityId ? data.entities[n.entityId] : null;
        const loops = !!n.entityId && seen.includes(n.entityId);
        const kids = refTarget && !loops ? refTarget.children : n.children;
        const icon = n.kind === "ASSET" && n.sublabel?.startsWith("Property") ? ICONS.PROPERTY : n.kind === "ASSET" && n.sublabel?.startsWith("Commercial") ? "🏭" : ICONS[n.kind];
        return (
          <Row
            key={key}
            icon={icon}
            label={n.label}
            route={n.route}
            sublabel={n.sublabel}
            value={n.value}
            negative={n.sign === -1}
            badges={n.badges}
            level={level}
            isOpen={open.has(key)}
            onToggle={() => toggle(key)}
            hasChildren={kids.length > 0}
          >
            <Nodes nodes={kids} path={key} level={level + 1} data={data} open={open} toggle={toggle} seen={n.entityId ? [...seen, n.entityId] : seen} />
          </Row>
        );
      })}
    </>
  );
}

function Row({
  icon,
  label,
  route,
  sublabel,
  value,
  valueNote,
  negative,
  badges,
  level,
  isOpen,
  onToggle,
  hasChildren,
  emptyNote,
  children,
}: {
  icon: string;
  label: string;
  route?: string;
  sublabel?: string | null;
  value?: number | null;
  valueNote?: string;
  negative?: boolean;
  badges?: string[];
  level: number;
  isOpen: boolean;
  onToggle: () => void;
  hasChildren: boolean;
  emptyNote?: string;
  children?: ReactNode;
}) {
  return (
    <li className={`tree-node level-${Math.min(level, 4)}`}>
      <div className="tree-row">
        {hasChildren ? (
          <button className="tree-toggle" aria-expanded={isOpen} aria-label={isOpen ? `Fold ${label}` : `Open ${label}`} onClick={onToggle}>
            <span className={isOpen ? "chevron open" : "chevron"} aria-hidden="true">
              ›
            </span>
          </button>
        ) : (
          <span className="tree-toggle placeholder" aria-hidden="true" />
        )}
        <span className="tree-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="tree-main">
          <div className="tree-label">
            {route ? <Link to={route}>{label}</Link> : <span>{label}</span>}
          </div>
          {(sublabel || (badges && badges.length > 0) || (!hasChildren && emptyNote)) && (
            <div className="tree-sub">
              {sublabel}
              {!hasChildren && emptyNote ? <span>{sublabel ? " · " : ""}{emptyNote}</span> : null}
              {badges?.map((b) => (
                <span key={b} className={b.includes("overdue") ? "tree-badge warn" : "tree-badge"}>
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        {value !== undefined && value !== null && (
          <div className={negative ? "tree-value owed" : "tree-value"} title={valueNote}>
            {negative ? `−${formatCurrency(value)}` : formatCurrency(value)}
          </div>
        )}
      </div>
      {hasChildren && isOpen && <ul className="tree">{children}</ul>}
    </li>
  );
}
