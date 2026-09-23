import { ItemCard } from "./ItemCard.js";
import { formatCurrency, formatDate } from "../utils.js";

/** Things that have been sold, folded away under the list — kept for their history, out of the totals. */
export function SoldList({ items }: { items: Array<{ id: string; to: string; title: string; date: string; price?: number | null }> }) {
  if (items.length === 0) return null;
  return (
    <details className="sold-list">
      <summary>Sold ({items.length})</summary>
      <ul className="item-card-list">
        {items.map((i) => (
          <ItemCard
            key={i.id}
            to={i.to}
            title={i.title}
            subtitle={`Sold ${formatDate(i.date)}`}
            right={<span style={{ color: "var(--text-muted)" }}>{formatCurrency(i.price)}</span>}
          />
        ))}
      </ul>
    </details>
  );
}
