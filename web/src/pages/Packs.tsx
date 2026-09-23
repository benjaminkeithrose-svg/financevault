import { useEffect, useState } from "react";
import { api, Entity, FinancialYear, PackPreview } from "../api/client.js";
import { financialYearLabelForToday } from "../utils.js";
import { HelpLink } from "../components/HelpLink.js";

const DOCUMENT_CATEGORY_KEYS = ["Tax", "Property", "Investment", "Personal", "Finance", "Trust/Company", "Commercial Property", "Income"];
const GENERATED_KEYS = ["ASSETS_LIABILITIES", "TAX_SUMMARY", "INCOME_SUMMARY"];

const PRESETS: Record<string, { categories: string[]; generated: string[] }> = {
  "Broker Pack": {
    categories: ["Property", "Finance", "Commercial Property", "Income", "ID"],
    generated: ["ASSETS_LIABILITIES", "INCOME_SUMMARY"],
  },
  "Accountant Pack": {
    categories: ["Tax", "Property", "Investment", "Trust/Company", "Commercial Property", "Income"],
    generated: ["ASSETS_LIABILITIES", "TAX_SUMMARY", "INCOME_SUMMARY"],
  },
};

export function Packs() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [entityId, setEntityId] = useState("");
  const [financialYearId, setFinancialYearId] = useState("");
  const [preview, setPreview] = useState<PackPreview | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenerated, setSelectedGenerated] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.entities.list().then(setEntities);
    api.financialYears.list().then((years) => {
      setFinancialYears(years);
      const current = years.find((y) => y.label === financialYearLabelForToday());
      if (current) setFinancialYearId(current.id);
    });
  }, []);

  function loadPreview() {
    if (!entityId) {
      setPreview(null);
      return;
    }
    api.documentPacks.preview(entityId, financialYearId || undefined).then(setPreview);
  }

  useEffect(loadPreview, [entityId, financialYearId]);

  function toggle(list: string[], setList: (v: string[]) => void, key: string) {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    setSelectedCategories(preset.categories);
    setSelectedGenerated(preset.generated);
  }

  async function generate() {
    if (!entityId || (selectedCategories.length === 0 && selectedGenerated.length === 0)) return;
    setGenerating(true);
    try {
      const blob = await api.documentPacks.generate({
        entityId,
        financialYearId: financialYearId || undefined,
        categories: selectedCategories,
        generated: selectedGenerated,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const entityName = entities.find((e) => e.id === entityId)?.name ?? "pack";
      a.download = `${entityName.replace(/[^a-z0-9]+/gi, "_")}_pack.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }

  const chipCount = (key: string) =>
    preview?.categories.find((c) => c.key === key)?.count ?? preview?.generated.find((c) => c.key === key)?.count ?? 0;
  const chipLabel = (key: string) =>
    preview?.categories.find((c) => c.key === key)?.label ?? preview?.generated.find((c) => c.key === key)?.label ?? key;

  function chip(list: string[], setList: (v: string[]) => void, key: string) {
    const selected = list.includes(key);
    const count = chipCount(key);
    return (
      <button
        key={key}
        type="button"
        className={`btn ${selected ? "" : "secondary"}`}
        onClick={() => toggle(list, setList, key)}
        disabled={count === 0}
        style={{ padding: "6px 12px", fontSize: 13, opacity: count === 0 ? 0.5 : 1 }}
      >
        {chipLabel(key)} ({count})
      </button>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Document Packs <HelpLink topic="packs" /></h2>
          <p>
            Pick exactly what to include — nothing is bundled automatically. A pack is a ZIP of the original
            documents you select, plus a document index and any generated summaries you tick.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ width: 240 }}>
          <option value="">— Select entity —</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} style={{ width: 160 }}>
          <option value="">All financial years</option>
          {financialYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </select>
      </div>

      {!entityId ? (
        <div className="placeholder-page">
          <p>Choose an entity to build a pack for it.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Presets</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              A starting point — every chip stays editable afterwards.
            </p>
            <div className="toolbar">
              {Object.keys(PRESETS).map((name) => (
                <button key={name} className="btn secondary" onClick={() => applyPreset(name)}>
                  {name}
                </button>
              ))}
              <button
                className="btn secondary"
                onClick={() => {
                  setSelectedCategories([]);
                  setSelectedGenerated([]);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Documents</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Original files, grouped by document type. A chip with 0 documents can't be selected.
            </p>
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              {DOCUMENT_CATEGORY_KEYS.map((key) => chip(selectedCategories, setSelectedCategories, key))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Generated summaries</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Built live from your current records, not from uploaded documents — always up to date.
            </p>
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              {GENERATED_KEYS.map((key) => chip(selectedGenerated, setSelectedGenerated, key))}
            </div>
          </div>

          <div className="card">
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <span>
                {selectedCategories.length + selectedGenerated.length === 0
                  ? "Nothing selected yet."
                  : `${selectedCategories.length} document chip(s), ${selectedGenerated.length} generated summary(ies) selected.`}
              </span>
              <button
                className="btn"
                onClick={generate}
                disabled={generating || selectedCategories.length + selectedGenerated.length === 0}
              >
                {generating ? "Building…" : "Generate & download"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
