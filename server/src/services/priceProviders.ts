/**
 * Price lookups for securities.
 *
 * These are the only outbound calls the investment module makes, and they are
 * off unless switched on in Settings. A lookup discloses which codes are held
 * — never a quantity, a value, an account or anything identifying — and codes
 * are batched into as few requests as the provider allows.
 *
 * Providers are deliberately behind one interface: these are free, unofficial
 * endpoints that can change or disappear, and when one does the rest of the
 * app must keep working with manually entered prices.
 */

export interface PriceQuote {
  code: string;
  price: number;
  priceDate: Date;
  source: "YAHOO" | "COINGECKO";
}

export interface PriceLookupResult {
  quotes: PriceQuote[];
  failures: Array<{ code: string; reason: string }>;
}

/** Shared so one unreachable provider can't hang a refresh. */
async function fetchJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "FinancialVault/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Yahoo Finance covers ASX, international listings and ETFs without a key.
 * ASX codes need an ".AX" suffix, which is filled in automatically when the
 * security doesn't carry an explicit provider symbol of its own.
 */
export function yahooSymbolFor(code: string, exchange: string | null, providerSymbol: string | null): string {
  if (providerSymbol) return providerSymbol;
  if (exchange === "ASX" && !code.includes(".")) return `${code}.AX`;
  return code;
}

interface YahooResponse {
  quoteResponse?: { result?: Array<{ symbol?: string; regularMarketPrice?: number; regularMarketTime?: number }> };
}

export async function fetchYahooPrices(symbols: string[]): Promise<PriceLookupResult> {
  if (symbols.length === 0) return { quotes: [], failures: [] };

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  let payload: YahooResponse;
  try {
    payload = (await fetchJson(url)) as YahooResponse;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { quotes: [], failures: symbols.map((code) => ({ code, reason })) };
  }

  const results = payload.quoteResponse?.result ?? [];
  const quotes: PriceQuote[] = [];
  const seen = new Set<string>();

  for (const row of results) {
    if (!row.symbol || typeof row.regularMarketPrice !== "number") continue;
    seen.add(row.symbol);
    quotes.push({
      code: row.symbol,
      price: row.regularMarketPrice,
      priceDate: row.regularMarketTime ? new Date(row.regularMarketTime * 1000) : new Date(),
      source: "YAHOO",
    });
  }

  return {
    quotes,
    failures: symbols.filter((s) => !seen.has(s)).map((code) => ({ code, reason: "No price returned for that symbol" })),
  };
}

interface CoinGeckoResponse {
  [id: string]: { aud?: number; last_updated_at?: number };
}

/**
 * CoinGecko keys on its own coin ids ("bitcoin"), not ticker symbols, so a
 * crypto security needs its provider symbol set to that id. Prices are asked
 * for in AUD directly rather than converted here.
 */
export async function fetchCoinGeckoPrices(ids: string[]): Promise<PriceLookupResult> {
  if (ids.length === 0) return { quotes: [], failures: [] };

  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}` +
    `&vs_currencies=aud&include_last_updated_at=true`;

  let payload: CoinGeckoResponse;
  try {
    payload = (await fetchJson(url)) as CoinGeckoResponse;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { quotes: [], failures: ids.map((code) => ({ code, reason })) };
  }

  const quotes: PriceQuote[] = [];
  const failures: Array<{ code: string; reason: string }> = [];

  for (const id of ids) {
    const row = payload[id];
    if (!row || typeof row.aud !== "number") {
      failures.push({ code: id, reason: "No price returned — check the CoinGecko id (e.g. \"bitcoin\", not \"BTC\")" });
      continue;
    }
    quotes.push({
      code: id,
      price: row.aud,
      priceDate: row.last_updated_at ? new Date(row.last_updated_at * 1000) : new Date(),
      source: "COINGECKO",
    });
  }

  return { quotes, failures };
}
