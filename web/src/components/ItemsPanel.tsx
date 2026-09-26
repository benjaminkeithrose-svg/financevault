import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ItemNode } from "../api/client.js";
import { DraftNotice, FormActions } from "./FormActions.js";
import { useDraft } from "../hooks/useDraft.js";
import { dueState, formatCurrency, formatDate, itemCategoryLabel, ITEM_CATEGORIES } from "../utils.js";

const EMPTY = {
  name: "",
  itemCategory: "APPLIANCE",
  make: "",
  model: "",
  identifier: "",
  acquisitionDate: "",
  acquisitionCost: "",
  warrantyExpiry: "",
};

function sumLifetime(items: ItemNode[]): number {
  return items.reduce((s, i) => s + i.lifetimeCost + sumLifetime(i.children), 0);
}

function ItemRow({ item, depth }: { item: ItemNode; depth: number }) {
  const warranty = dueState(item.warrantyExpiry);
  const service = dueState(item.nextDue);
  return (
    <>
      <li className="item-tree-row" style={{ paddingLeft: depth * 20 }}>
        <div>
          <Link to={`/assets/${item.id}`}>
            <strong>{item.name}</strong>
          </Link>
          <div className="item-tree-meta">
            {[itemCategoryLabel(item.itemCategory), [item.make, item.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
            {item.acquisitionDate ? ` · bought ${formatDate(item.acquisitionDate)}` : ""}
            {item.warrantyExpiry && (
              <>
                {" · "}
                <span className={warranty ? "badge status-NEEDS_CONFIRMATION" : ""}>
                  warranty {warranty === "expired" ? "ended" : "to"} {formatDate(item.warrantyExpiry)}
                </span>
              </>
            )}
            {item.nextDue && (
              <>
                {" · "}
                <span className={service ? "badge status-NEEDS_CONFIRMATION" : ""}>service due {formatDate(item.nextDue)}</span>
              </>
            )}
            {item.documentCount > 0 ? ` · ${item.documentCount} doc${item.documentCount === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div className="item-tree-cost" title="Purchase price plus everything spent on it since">
          {formatCurrency(item.lifetimeCost)}
        </div>
      </li>
      {item.children.map((c) => (
        <ItemRow key={c.id} item={c} depth={depth + 1} />
      ))}
    </>
  );
}

/**
 * The things that belong to an asset — the air con in a rental, the washing
 * machine at home — as a tree, each with what it has cost to own. Their value
 * is part of the parent's, so none of it is added to net worth.
 */
export function ItemsPanel({ parentAssetId, title = "Items" }: { parentAssetId: string; title?: string }) {
  const [items, setItems] = useState<ItemNode[]>([]);
  const [form, setForm, draft] = useDraft(`items:${parentAssetId}:new`, EMPTY);
  const [showForm, setShowForm] = useState(draft.restored);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.assets.get(parentAssetId).then((a) => setItems(a.items ?? []));
  }
  useEffect(load, [parentAssetId]);

  async function create() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    try {
      await api.assets.create({
        name: form.name.trim(),
        assetType: "ITEM",
        parentAssetId,
        itemCategory: form.itemCategory,
        make: form.make || null,
        model: form.model || null,
        identifier: form.identifier || null,
        acquisitionDate: form.acquisitionDate ? new Date(form.acquisitionDate).toISOString() : null,
        acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : null,
        warrantyExpiry: form.warrantyExpiry ? new Date(form.warrantyExpiry).toISOString() : null,
      });
      draft.clear();
      setShowForm(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button className="btn secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "Add item"}
        </button>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Appliances, fittings and equipment that belong to it — each with its receipts, warranty and service history. Part of
        its value, so not added to net worth again.
      </p>

      {showForm && (
        <div>
          <DraftNotice draft={draft} />
          <div className="grid grid-2">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Living room split system" />
            </div>
            <div>
              <label>Kind</label>
              <select value={form.itemCategory} onChange={(e) => setForm({ ...form, itemCategory: e.target.value })}>
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Make</label>
              <input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Daikin" />
            </div>
            <div>
              <label>Model</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div>
              <label>Serial number</label>
              <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
            </div>
            <div>
              <label>Bought</label>
              <input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} />
            </div>
            <div>
              <label>Price paid</label>
              <input type="number" value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })} />
            </div>
            <div>
              <label>Warranty ends</label>
              <input type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
            </div>
          </div>
          {error && <div className="message-box warning">{error}</div>}
          <FormActions onSubmit={create} draft={draft} label="Add" />
        </div>
      )}

      {items.length === 0 ? (
        !showForm && <p className="empty-state">Nothing recorded under it yet.</p>
      ) : (
        <>
          <ul className="item-tree">
            {items.map((i) => (
              <ItemRow key={i.id} item={i} depth={0} />
            ))}
          </ul>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 0 }}>
            Total spent on these items (purchases plus servicing and repairs): <strong>{formatCurrency(sumLifetime(items))}</strong>
          </p>
        </>
      )}
    </div>
  );
}
