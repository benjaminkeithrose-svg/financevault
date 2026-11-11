import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

// A tappable list-item card (PREFERENCES.md: "Cards carry the minimum: the
// name, and the one or two things I need to recognise it. Everything else
// goes behind a tap. Tap the card to open or edit it. Secondary actions go
// in a ⋯ menu on the card, not a row of buttons."). `menu` is typically an
// <OverflowMenu items={...} />, rendered so its own click doesn't open the
// card (OverflowMenu already stops propagation).
export function ItemCard({
  to,
  title,
  subtitle,
  right,
  menu,
}: {
  to: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  menu?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="item-card"
      role="link"
      tabIndex={0}
      onClick={() => navigate(to)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(to);
      }}
    >
      <div className="item-card-body">
        <div className="item-card-title">{title}</div>
        {subtitle && <div className="item-card-subtitle">{subtitle}</div>}
      </div>
      <div className="item-card-meta">
        {right}
        {menu}
      </div>
    </div>
  );
}
