import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  api,
  DisposalPreview,
  InvestmentAccount,
  InvestmentPosition,
  Security,
} from "../api/client.js";
import { DocumentLinker } from "../components/DocumentLinker.js";
import { formatCurrency, formatCurrencyExact, formatDate, humanize } from "../utils.js";

const ASSET_CLASSES = ["SHARE", "ETF", "MANAGED_FUND", "CRYPTO", "SUPER", "BOND", "OTHER"] as const;

const emptyParcel = {
  code: "",
  assetClass: "SHARE" as (typeof ASSET_CLASSES)[number],
  exchange: "ASX",
  priceSource: "MANUAL" as Security["priceSource"],
  providerSymbol: "",
  acquisitionDate: "",
  quantity: "",
  unitPrice: "",
  brokerage: "",
};

const emptyDisposal = { securityId: "", disposalDate: "", quantity: "", unitPrice: "", brokerage: "" };

const emptyDividend = {
  securityId: "",
  paymentDate: "",
  frankedAmount: "",
  unfrankedAmount: "",
  frankingCredit: "",
  reinvestQuantity: "",
  reinvestUnitPrice: "",
};

export function InvestmentAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<InvestmentAccount | null>(null);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showParcel, setShowParcel] = useState(false);
  const [parcelForm, setParcelForm] = useState(emptyParcel);

  const [showDisposal, setShowDisposal] = useState(false);
  const [disposalForm, setDisposalForm] = useState(emptyDisposal);
  const [preview, setPreview] = useState<DisposalPreview | null>(null);

  const [showDividend, setShowDividend] = useState(false);
  const [dividendForm, setDividendForm] = useState(emptyDividend);

  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api.investments.get(id).then(setAccount).catch((e) => setError(e.message));
    api.investments.listSecurities().then(setSecurities).catch(() => {});
  }, [id]);

  useEffect(load, [load]);

  async function addParcel() {
    if (!id) return;
    setError(null);
    try {
      // A security is shared across accounts, so it's created once and reused
      // by code — this returns the existing one if it's already known.
      const security = await api.investments.createSecurity({
        code: parcelForm.code.trim().toUpperCase(),
        assetClass: parcelForm.assetClass,
        exchange: parcelForm.exchange.trim() || null,
        priceSource: parcelForm.priceSource,
        providerSymbol: parcelForm.providerSymbol.trim() || null,
      });
      await api.investments.addParcel(id, {
        securityId: security.id,
        acquisitionDate: new Date(parcelForm.acquisitionDate).toISOString(),
        quantity: Number(parcelForm.quantity),
        unitPrice: Number(parcelForm.unitPrice),
        brokerage: Number(parcelForm.brokerage || 0),
      });
      setParcelForm(emptyParcel);
      setShowParcel(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runPreview() {
    if (!id || !disposalForm.securityId || !disposalForm.quantity) return;
    setError(null);
    try {
      setPreview(
        await api.investments.disposalPreview(id, {
          securityId: disposalForm.securityId,
          quantity: Number(disposalForm.quantity),
          unitPrice: Number(disposalForm.unitPrice || 0),
          brokerage: Number(disposalForm.brokerage || 0),
          disposalDate: new Date(disposalForm.disposalDate || Date.now()).toISOString(),
        })
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addDisposal() {
    if (!id) return;
    setError(null);
    try {
      await api.investments.addDisposal(id, {
        securityId: disposalForm.securityId,
        disposalDate: new Date(disposalForm.disposalDate).toISOString(),
        quantity: Number(disposalForm.quantity),
        unitPrice: Number(disposalForm.unitPrice),
        brokerage: Number(disposalForm.brokerage || 0),
      });
      setDisposalForm(emptyDisposal);
      setPreview(null);
      setShowDisposal(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addDividend() {
    if (!id) return;
    setError(null);
    try {
      const reinvesting = Number(dividendForm.reinvestQuantity) > 0;
      await api.investments.addDividend(id, {
        securityId: dividendForm.securityId,
        paymentDate: new Date(dividendForm.paymentDate).toISOString(),
        frankedAmount: Number(dividendForm.frankedAmount || 0),
        unfrankedAmount: Number(dividendForm.unfrankedAmount || 0),
        frankingCredit: Number(dividendForm.frankingCredit || 0),
        reinvestment: reinvesting
          ? {
              quantity: Number(dividendForm.reinvestQuantity),
              unitPrice: Number(dividendForm.reinvestUnitPrice || 0),
            }
          : undefined,
      });
      setDividendForm(emptyDividend);
      setShowDividend(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function savePrice(securityId: string) {
    const raw = priceEdits[securityId];
    if (!raw) return;
    await api.investments.setPrice(securityId, Number(raw));
    setPriceEdits((prev) => ({ ...prev, [securityId]: "" }));
    load();
  }

  async function refreshPrices() {
    setRefreshing(true);
    setRefreshNote(null);
    setError(null);
    try {
      const result = await api.investments.refreshPrices();
      setRefreshNote(
        result.note ??
          `Updated ${result.updated} price${result.updated === 1 ? "" : "s"}` +
            (result.failures.length > 0
              ? `. Couldn't get: ${result.failures.map((f) => f.code).join(", ")}`
              : ".")
      );
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  if (error && !account) return <div className="empty-state">{error}</div>;
  if (!account) return <div className="empty-state">Loading…</div>;

  const positions = account.positions ?? [];
  const totals = account.totals;
  const held = positions.filter((p) => p.quantity > 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{account.institution}</h2>
          <p>
            {humanize(account.accountType)} · {account.entity?.name}
          </p>
        </div>
      </div>

      {error && <div className="message-box warning">{error}</div>}

      <div className="grid grid-4">
        <div className="stat-tile">
          <div className="label">Cost base</div>
          <div className="value">{formatCurrency(totals?.costBase)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Market value</div>
          <div className="value">{formatCurrency(totals?.marketValue)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Realised (net)</div>
          <div className="value">{formatCurrency(totals?.realisedNetGain)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Franking credits</div>
          <div className="value">{formatCurrency(totals?.frankingCredits)}</div>
        </div>
      </div>

      {totals && totals.unpricedCount > 0 && (
        <div className="message-box warning">
          {totals.unpricedCount} holding{totals.unpricedCount === 1 ? " has" : "s have"} no price recorded, so the
          market value above covers only the rest. Enter a price below, or set a price source and refresh.
        </div>
      )}

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Holdings</h3>
          <div className="toolbar">
            <button className="btn secondary" onClick={refreshPrices} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh prices"}
            </button>
            <button className="btn" onClick={() => setShowParcel(!showParcel)}>
              {showParcel ? "Cancel" : "Add purchase"}
            </button>
          </div>
        </div>

        {refreshNote && <div className="message-box info">{refreshNote}</div>}

        {showParcel && (
          <>
            <div className="grid grid-3">
              <div>
                <label>Code</label>
                <input
                  value={parcelForm.code}
                  onChange={(e) => setParcelForm({ ...parcelForm, code: e.target.value })}
                  placeholder="CBA"
                />
              </div>
              <div>
                <label>Type</label>
                <select
                  value={parcelForm.assetClass}
                  onChange={(e) =>
                    setParcelForm({ ...parcelForm, assetClass: e.target.value as (typeof ASSET_CLASSES)[number] })
                  }
                >
                  {ASSET_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {humanize(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Price source</label>
                <select
                  value={parcelForm.priceSource}
                  onChange={(e) =>
                    setParcelForm({ ...parcelForm, priceSource: e.target.value as Security["priceSource"] })
                  }
                >
                  <option value="MANUAL">Enter prices myself</option>
                  <option value="YAHOO">Yahoo (shares, ETFs)</option>
                  <option value="COINGECKO">CoinGecko (crypto)</option>
                </select>
              </div>
            </div>
            {parcelForm.priceSource === "COINGECKO" && (
              <div>
                <label>CoinGecko id</label>
                <input
                  value={parcelForm.providerSymbol}
                  onChange={(e) => setParcelForm({ ...parcelForm, providerSymbol: e.target.value })}
                  placeholder="bitcoin — CoinGecko uses names, not ticker symbols"
                />
              </div>
            )}
            <div className="grid grid-4">
              <div>
                <label>Purchase date</label>
                <input
                  type="date"
                  value={parcelForm.acquisitionDate}
                  onChange={(e) => setParcelForm({ ...parcelForm, acquisitionDate: e.target.value })}
                />
              </div>
              <div>
                <label>Quantity</label>
                <input
                  type="number"
                  step="any"
                  value={parcelForm.quantity}
                  onChange={(e) => setParcelForm({ ...parcelForm, quantity: e.target.value })}
                />
              </div>
              <div>
                <label>Price per unit</label>
                <input
                  type="number"
                  step="any"
                  value={parcelForm.unitPrice}
                  onChange={(e) => setParcelForm({ ...parcelForm, unitPrice: e.target.value })}
                />
              </div>
              <div>
                <label>Brokerage</label>
                <input
                  type="number"
                  step="any"
                  value={parcelForm.brokerage}
                  onChange={(e) => setParcelForm({ ...parcelForm, brokerage: e.target.value })}
                />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button
                className="btn"
                onClick={addParcel}
                disabled={!parcelForm.code.trim() || !parcelForm.acquisitionDate || !parcelForm.quantity}
              >
                Add purchase
              </button>
            </div>
          </>
        )}

        {positions.length === 0 ? (
          <p className="empty-state">Nothing recorded yet. Add a purchase to get started.</p>
        ) : (
          positions.map((position) => <PositionCard key={position.securityId} position={position} priceEdits={priceEdits} setPriceEdits={setPriceEdits} savePrice={savePrice} />)
        )}
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Sales</h3>
          <button className="btn" onClick={() => setShowDisposal(!showDisposal)} disabled={held.length === 0}>
            {showDisposal ? "Cancel" : "Record a sale"}
          </button>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Sales draw from your oldest parcels first. Which parcels go affects the tax, so the preview shows the gain
          before anything is recorded.
        </p>

        {showDisposal && (
          <>
            <div className="grid grid-4">
              <div>
                <label>Holding</label>
                <select
                  value={disposalForm.securityId}
                  onChange={(e) => {
                    setDisposalForm({ ...disposalForm, securityId: e.target.value });
                    setPreview(null);
                  }}
                >
                  <option value="">Choose…</option>
                  {held.map((p) => (
                    <option key={p.securityId} value={p.securityId}>
                      {p.security.code} ({p.quantity} held)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Sale date</label>
                <input
                  type="date"
                  value={disposalForm.disposalDate}
                  onChange={(e) => setDisposalForm({ ...disposalForm, disposalDate: e.target.value })}
                />
              </div>
              <div>
                <label>Quantity</label>
                <input
                  type="number"
                  step="any"
                  value={disposalForm.quantity}
                  onChange={(e) => setDisposalForm({ ...disposalForm, quantity: e.target.value })}
                />
              </div>
              <div>
                <label>Price per unit</label>
                <input
                  type="number"
                  step="any"
                  value={disposalForm.unitPrice}
                  onChange={(e) => setDisposalForm({ ...disposalForm, unitPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn secondary" onClick={runPreview} disabled={!disposalForm.securityId}>
                Preview the gain
              </button>
              <button
                className="btn"
                onClick={addDisposal}
                disabled={!disposalForm.securityId || !disposalForm.disposalDate || !disposalForm.quantity}
              >
                Record sale
              </button>
            </div>

            {preview && (
              <div className="message-box info" style={{ marginTop: 12 }}>
                <strong>
                  Gain {formatCurrencyExact(preview.result.grossGain)} · discount{" "}
                  {formatCurrencyExact(preview.result.discountAmount)} · net{" "}
                  {formatCurrencyExact(preview.result.netGain)}
                </strong>
                <table style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>From parcel bought</th>
                      <th>Units</th>
                      <th>Cost base</th>
                      <th>Gain</th>
                      <th>Discounted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.result.allocations.map((a) => (
                      <tr key={a.parcelId}>
                        <td>{formatDate(a.acquisitionDate)}</td>
                        <td>{a.quantity}</td>
                        <td>{formatCurrencyExact(a.costBase)}</td>
                        <td>{formatCurrencyExact(a.grossGain)}</td>
                        <td>{a.discountEligible ? "Yes — held over 12 months" : "No — held under 12 months"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {(account.disposals ?? []).length === 0 ? (
          <p className="empty-state">No sales recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Code</th>
                <th>Units</th>
                <th>Proceeds</th>
                <th>Cost base</th>
                <th>Gain</th>
                <th>Discount</th>
                <th>Net</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(account.disposals ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{formatDate(d.disposalDate)}</td>
                  <td>{d.security.code}</td>
                  <td>{d.quantity}</td>
                  <td>{formatCurrencyExact(d.result.proceeds)}</td>
                  <td>{formatCurrencyExact(d.result.costBase)}</td>
                  <td>{formatCurrencyExact(d.result.grossGain)}</td>
                  <td>{formatCurrencyExact(d.result.discountAmount)}</td>
                  <td>{formatCurrencyExact(d.result.netGain)}</td>
                  <td>
                    <button
                      className="btn danger secondary"
                      onClick={async () => {
                        await api.investments.removeDisposal(d.id);
                        load();
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Dividends and distributions</h3>
          <button className="btn" onClick={() => setShowDividend(!showDividend)} disabled={positions.length === 0}>
            {showDividend ? "Cancel" : "Record a dividend"}
          </button>
        </div>

        {showDividend && (
          <>
            <div className="grid grid-3">
              <div>
                <label>Holding</label>
                <select
                  value={dividendForm.securityId}
                  onChange={(e) => setDividendForm({ ...dividendForm, securityId: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {positions.map((p) => (
                    <option key={p.securityId} value={p.securityId}>
                      {p.security.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Payment date</label>
                <input
                  type="date"
                  value={dividendForm.paymentDate}
                  onChange={(e) => setDividendForm({ ...dividendForm, paymentDate: e.target.value })}
                />
              </div>
              <div>
                <label>Franked amount</label>
                <input
                  type="number"
                  step="any"
                  value={dividendForm.frankedAmount}
                  onChange={(e) => setDividendForm({ ...dividendForm, frankedAmount: e.target.value })}
                />
              </div>
              <div>
                <label>Unfranked amount</label>
                <input
                  type="number"
                  step="any"
                  value={dividendForm.unfrankedAmount}
                  onChange={(e) => setDividendForm({ ...dividendForm, unfrankedAmount: e.target.value })}
                />
              </div>
              <div>
                <label>Franking credit</label>
                <input
                  type="number"
                  step="any"
                  value={dividendForm.frankingCredit}
                  onChange={(e) => setDividendForm({ ...dividendForm, frankingCredit: e.target.value })}
                />
              </div>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "8px 0 0" }}>
              If it was reinvested, enter the units and price below — that buys real units, so it becomes a parcel of
              its own and keeps their cost base.
            </p>
            <div className="grid grid-2">
              <div>
                <label>Units reinvested (optional)</label>
                <input
                  type="number"
                  step="any"
                  value={dividendForm.reinvestQuantity}
                  onChange={(e) => setDividendForm({ ...dividendForm, reinvestQuantity: e.target.value })}
                />
              </div>
              <div>
                <label>Reinvestment price per unit</label>
                <input
                  type="number"
                  step="any"
                  value={dividendForm.reinvestUnitPrice}
                  onChange={(e) => setDividendForm({ ...dividendForm, reinvestUnitPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button
                className="btn"
                onClick={addDividend}
                disabled={!dividendForm.securityId || !dividendForm.paymentDate}
              >
                Record dividend
              </button>
            </div>
          </>
        )}

        {(account.dividends ?? []).length === 0 ? (
          <p className="empty-state">No dividends recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Code</th>
                <th>Franked</th>
                <th>Unfranked</th>
                <th>Franking credit</th>
                <th>Reinvested</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(account.dividends ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{formatDate(d.paymentDate)}</td>
                  <td>{d.security.code}</td>
                  <td>{formatCurrencyExact(d.frankedAmount)}</td>
                  <td>{formatCurrencyExact(d.unfrankedAmount)}</td>
                  <td>{formatCurrencyExact(d.frankingCredit)}</td>
                  <td>{d.reinvestedParcelId ? "Yes" : "—"}</td>
                  <td>
                    <button
                      className="btn danger secondary"
                      onClick={async () => {
                        await api.investments.removeDividend(d.id);
                        load();
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <DocumentLinker targetType="INVESTMENT_ACCOUNT" targetId={account.id} />
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Gains here are calculated from what you recorded, applying the CGT discount per parcel based on how long it was
        held and who owns the account. They're for your accountant to confirm, not tax advice.
      </p>

      {securities.length === 0 && null}
    </div>
  );
}

function PositionCard({
  position,
  priceEdits,
  setPriceEdits,
  savePrice,
}: {
  position: InvestmentPosition;
  priceEdits: Record<string, string>;
  setPriceEdits: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  savePrice: (securityId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const incomplete = position.quantity === 0 && position.parcels.length > 0;

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong>{position.security.code}</strong>{" "}
          <span className="tag">{humanize(position.security.assetClass)}</span>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {position.quantity} units · cost {formatCurrencyExact(position.costBase)} · avg{" "}
            {formatCurrencyExact(position.averageUnitCost)}
            {position.discountEligibleQuantity > 0 &&
              ` · ${position.discountEligibleQuantity} eligible for the CGT discount`}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div>
            {position.marketValue === null ? (
              <span style={{ color: "var(--text-muted)" }}>No price recorded</span>
            ) : (
              <>
                <strong>{formatCurrency(position.marketValue)}</strong>{" "}
                <span style={{ color: (position.unrealisedGain ?? 0) >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {(position.unrealisedGain ?? 0) >= 0 ? "+" : ""}
                  {formatCurrencyExact(position.unrealisedGain)}
                </span>
              </>
            )}
          </div>
          {position.priceDate && (
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {formatCurrencyExact(position.latestPrice)} on {formatDate(position.priceDate)}
              {position.priceSource && position.priceSource !== "MANUAL" ? ` (${position.priceSource.toLowerCase()})` : ""}
            </div>
          )}
        </div>
      </div>

      {incomplete && (
        <div className="message-box warning" style={{ marginTop: 8 }}>
          This holding has no quantity recorded — open its parcels below and fill in what's missing.
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn secondary" onClick={() => setOpen(!open)}>
          {open ? "Hide parcels" : `Show ${position.parcels.length} parcel${position.parcels.length === 1 ? "" : "s"}`}
        </button>
        <input
          type="number"
          step="any"
          placeholder="Set price"
          value={priceEdits[position.securityId] ?? ""}
          onChange={(e) => setPriceEdits((prev) => ({ ...prev, [position.securityId]: e.target.value }))}
          style={{ maxWidth: 140 }}
        />
        <button
          className="btn secondary"
          onClick={() => savePrice(position.securityId)}
          disabled={!priceEdits[position.securityId]}
        >
          Save price
        </button>
      </div>

      {open && (
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Bought</th>
              <th>How</th>
              <th>Units left</th>
              <th>Price</th>
              <th>Cost base</th>
              <th>CGT discount</th>
            </tr>
          </thead>
          <tbody>
            {position.parcels.map((p) => {
              const heldOverAYear =
                new Date(p.acquisitionDate).getTime() < new Date().setFullYear(new Date().getFullYear() - 1);
              return (
                <tr key={p.id}>
                  <td>{formatDate(p.acquisitionDate)}</td>
                  <td>{humanize(p.acquisitionType)}</td>
                  <td>{p.remainingQuantity}</td>
                  <td>{formatCurrencyExact(p.unitPrice)}</td>
                  <td>{formatCurrencyExact(p.costBase)}</td>
                  <td>{heldOverAYear ? "Eligible" : "Not yet"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
