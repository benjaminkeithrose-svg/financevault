import { useEffect } from "react";
import { HelpLink } from "../components/HelpLink.js";
import { useFeatures } from "../features.js";
import { DEBT_LISTS, DebtList } from "../utils.js";
import { Liabilities } from "./Liabilities.js";

const ORDER: DebtList[] = ["property", "vehicle", "cards", "other"];

/**
 * Every debt on one page — property loans, vehicle & boat loans, credit
 * cards and personal debts as sections, each with its own New button. The
 * old per-kind addresses open this page at their section.
 */
export function LoansAndCards({ focus }: { focus?: DebtList }) {
  const features = useFeatures();
  const lists = ORDER.filter((k) => k !== "vehicle" || features.on("vehicles"));

  useEffect(() => {
    if (!focus || focus === "property") return;
    // Let the sections render before scrolling to the one asked for.
    const t = window.setTimeout(() => document.getElementById(`debts-${focus}`)?.scrollIntoView({ block: "start" }), 150);
    return () => window.clearTimeout(t);
  }, [focus]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            Loans & cards <HelpLink topic="loans-assets" />
          </h2>
          <p>Everything owed, by kind. Jump to:{" "}
            {lists.map((k, i) => (
              <span key={k}>
                {i > 0 && " · "}
                <a href={`#debts-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`debts-${k}`)?.scrollIntoView({ block: "start" }); }}>
                  {DEBT_LISTS[k].title}
                </a>
              </span>
            ))}
          </p>
        </div>
      </div>
      {lists.map((k) => (
        <section key={k} id={`debts-${k}`} className="debt-section">
          <Liabilities scope={k} section />
        </section>
      ))}
    </div>
  );
}
